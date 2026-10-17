package com.skienlabs.tasks

import androidx.compose.ui.geometry.Offset
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.ui.tags.renderLogo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = android.app.Application::class)
class LogoSaveIT {
    @Test
    fun croppedPhotoLogoSaves() = runBlocking {
        val url = System.getenv("TASKS_IT_URL")
        assumeTrue(url != null)
        // A noisy "photo" so compression has real work to do.
        val src = android.graphics.Bitmap.createBitmap(1600, 1200, android.graphics.Bitmap.Config.ARGB_8888)
        val rnd = java.util.Random(1)
        for (y in 0 until 1200 step 2) for (x in 0 until 1600 step 2) src.setPixel(x, y, rnd.nextInt() or 0xFF000000.toInt())
        val view = 840f
        val scale = view / 1200f
        val data = renderLogo(src, view, scale, Offset((view - 1600 * scale) / 2, 0f))
        println("LOGO len=${data.length} head=${data.take(40)}")
        val api = HttpTasksApi(url!!, { "dev" })
        val store = Store(api, NoCache, CoroutineScope(Dispatchers.Unconfined), Dispatchers.Unconfined)
        try {
            val t = store.saveTag(null, "Photo Tag ${System.nanoTime()}", "teal", data, true)
            println("LOGO saved ${t.id} logoLen=${t.logo?.length}")
            val t2 = store.saveTag(t.id, t.name, "teal", data, true)
            println("LOGO updated ${t2.id}")
        } catch (e: Exception) {
            println("LOGO FAIL ${e::class.qualifiedName}: ${e.message}")
            e.printStackTrace(System.out)
            throw e
        }
    }
}
