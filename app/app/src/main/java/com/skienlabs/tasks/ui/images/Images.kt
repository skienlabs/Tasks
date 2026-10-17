package com.skienlabs.tasks.ui.images

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.skienlabs.tasks.data.ApiException
import com.skienlabs.tasks.data.PreparedImage
import com.skienlabs.tasks.data.TasksApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/**
 * Task images on this phone: a small memory cache of decoded bitmaps and a disk cache of the
 * files (ids never change content, so a file is downloaded once). Cleared on sign-out.
 */
class ImageStore(context: Context, private val api: TasksApi, private val http: okhttp3.OkHttpClient? = null) {
    private val dir = File(context.cacheDir, "task-images")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val memory = object : LruCache<String, ImageBitmap>(48 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }
    private val inflight = HashMap<String, Deferred<ImageBitmap?>>()

    private fun key(id: String, size: String) = "$id:$size"
    private fun file(id: String, size: String) = File(dir, "${id}_$size")

    fun cached(id: String, size: String): ImageBitmap? = memory.get(key(id, size))

    /** Keeps the local copy of an image being uploaded, so it shows instantly and isn't downloaded again. */
    fun seed(img: PreparedImage) {
        scope.async {
            runCatching {
                dir.mkdirs()
                file(img.id, "thumb").writeBytes(img.thumb)
                file(img.id, "full").writeBytes(img.full)
                decode(img.thumb, 0)?.let { memory.put(key(img.id, "thumb"), it) }
            }
        }
    }

    /** Thumb or full image, or null if it can't be loaded (offline and not cached, or gone). */
    suspend fun load(id: String, size: String): ImageBitmap? {
        cached(id, size)?.let { return it }
        val k = key(id, size)
        val job = synchronized(inflight) {
            inflight.getOrPut(k) {
                scope.async {
                    try {
                        val f = file(id, size)
                        val bytes = if (f.exists() && f.length() > 0) f.readBytes() else {
                            val b = api.image(id, size)
                            runCatching {
                                dir.mkdirs()
                                val tmp = File(dir, "${f.name}.${UUID.randomUUID()}.tmp")
                                tmp.writeBytes(b)
                                if (!tmp.renameTo(f)) tmp.delete()
                            }
                            b
                        }
                        decode(bytes, if (size == "full") 2400 else 0)?.also { memory.put(k, it) }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: ApiException) {
                        null
                    } catch (e: Exception) {
                        null
                    } finally {
                        synchronized(inflight) { inflight.remove(k) }
                    }
                }
            }
        }
        return job.await()
    }

    /**
     * A picture from a public URL (the Google profile photo). Cached like attachments,
     * keyed by a hash of the URL; never sent with the sign-in token.
     */
    suspend fun loadUrl(url: String): ImageBitmap? {
        val client = http ?: return null
        val id = "url-" + java.security.MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
            .joinToString("") { "%02x".format(it) }.take(32)
        cached(id, "full")?.let { return it }
        val k = key(id, "full")
        val job = synchronized(inflight) {
            inflight.getOrPut(k) {
                scope.async {
                    try {
                        val f = file(id, "full")
                        val bytes = if (f.exists() && f.length() > 0) f.readBytes() else {
                            val req = okhttp3.Request.Builder().url(url).build()
                            val b = withContext(Dispatchers.IO) {
                                client.newCall(req).execute().use { r -> if (r.isSuccessful) r.body.bytes() else null }
                            } ?: return@async null
                            runCatching { dir.mkdirs(); f.writeBytes(b) }
                            b
                        }
                        decode(bytes, 512)?.also { memory.put(k, it) }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        null
                    } finally {
                        synchronized(inflight) { inflight.remove(k) }
                    }
                }
            }
        }
        return job.await()
    }

    fun clear() {
        memory.evictAll()
        scope.async { runCatching { dir.deleteRecursively() } }
    }

    private fun decode(bytes: ByteArray, maxPx: Int): ImageBitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0) return null
        var sample = 1
        if (maxPx > 0) while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxPx) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
    }
}

val LocalImages = staticCompositionLocalOf<ImageStore?> { null }

/** Result of loading an image: [image] null and [failed] false means still loading. */
data class ImageLoad(val image: ImageBitmap?, val failed: Boolean)

@Composable
fun rememberImageLoad(id: String, size: String): ImageLoad {
    val store = LocalImages.current
    val state by produceState(ImageLoad(store?.cached(id, size), store == null), id, size, store) {
        if (value.image == null && store != null) {
            val img = store.load(id, size)
            value = ImageLoad(img, img == null)
        }
    }
    return state
}

/** A public picture (profile photo); null while loading or if it can't be loaded. */
@Composable
fun rememberUrlImage(url: String?): ImageBitmap? {
    val store = LocalImages.current
    val img by produceState<ImageBitmap?>(null, url, store) {
        if (url != null && store != null) value = store.loadUrl(url)
    }
    return img
}

/** Loads an attachment image; null while loading or if unavailable. */
@Composable
fun rememberImage(id: String, size: String): ImageBitmap? = rememberImageLoad(id, size).image

private const val FULL_PX = 1600
private const val THUMB_PX = 400

/** Decodes a picked/taken photo (any format the phone reads, rotation applied) and shrinks it to JPEG. */
suspend fun prepareImage(context: Context, uri: Uri): PreparedImage = withContext(Dispatchers.Default) {
    val src = try {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val w = info.size.width
            val h = info.size.height
            if (w.toLong() * h > 100_000_000L) throw IllegalArgumentException("That image is too large")
            val scale = minOf(1f, FULL_PX.toFloat() / maxOf(w, h))
            decoder.setTargetSize(maxOf(1, Math.round(w * scale)), maxOf(1, Math.round(h * scale)))
        }
    } catch (e: IllegalArgumentException) {
        throw e
    } catch (e: Exception) {
        throw IllegalArgumentException("That file isn't an image this phone can open")
    }
    try {
        val full = flatten(src)
        val thumbScale = minOf(1f, THUMB_PX.toFloat() / maxOf(full.width, full.height))
        val thumb = Bitmap.createScaledBitmap(full, maxOf(1, Math.round(full.width * thumbScale)), maxOf(1, Math.round(full.height * thumbScale)), true)
        fun jpeg(b: Bitmap, q: Int) = ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, q, it) }.toByteArray()
        var fullBytes = jpeg(full, 82)
        if (fullBytes.size > 5_500_000) fullBytes = jpeg(full, 60)
        val result = PreparedImage(UUID.randomUUID().toString(), fullBytes, jpeg(thumb, 75), full.width, full.height)
        if (thumb !== full) thumb.recycle()
        if (full !== src) full.recycle()
        result
    } finally {
        src.recycle()
    }
}

/** JPEG has no transparency: put see-through images on white. */
private fun flatten(src: Bitmap): Bitmap {
    if (!src.hasAlpha()) return src
    val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
    Canvas(out).apply {
        drawColor(Color.WHITE)
        drawBitmap(src, 0f, 0f, null)
    }
    return out
}
