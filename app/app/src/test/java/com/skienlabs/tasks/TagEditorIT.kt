package com.skienlabs.tasks

import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.ActivityResultRegistryOwner
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.core.app.ActivityOptionsCompat
import com.skienlabs.tasks.data.HttpTasksApi
import com.skienlabs.tasks.data.NoCache
import com.skienlabs.tasks.data.Store
import com.skienlabs.tasks.ui.tags.TagEditor
import com.skienlabs.tasks.ui.theme.TasksTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** The real tag editor flow (pick → crop → save) against a dev server. Needs TASKS_IT_URL. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = android.app.Application::class)
class TagEditorIT {
    @get:Rule val rule = createComposeRule()

    @Test
    fun pickCropSave() {
        val url = System.getenv("TASKS_IT_URL")
        assumeTrue(url != null)
        val ctx = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        // A real JPEG photo on disk.
        val file = File(ctx.cacheDir, "pick.jpg")
        val bmp = android.graphics.Bitmap.createBitmap(3000, 2000, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        c.drawColor(android.graphics.Color.rgb(30, 120, 200))
        val p = android.graphics.Paint().apply { color = android.graphics.Color.YELLOW }
        val rnd = java.util.Random(3)
        repeat(400) { p.color = rnd.nextInt() or 0xFF000000.toInt(); c.drawCircle(rnd.nextFloat() * 3000, rnd.nextFloat() * 2000, 40f + rnd.nextFloat() * 120, p) }
        file.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, it) }
        val api = HttpTasksApi(url!!, { "dev" })
        val store = Store(api, NoCache, CoroutineScope(Dispatchers.Main.immediate), Dispatchers.IO)
        val tag = runBlocking { store.saveTag(null, "Personal ${System.nanoTime() % 100000}", "teal", null, false) }

        val registry = object : ActivityResultRegistry() {
            override fun <I, O> onLaunch(requestCode: Int, contract: ActivityResultContract<I, O>, input: I, options: ActivityOptionsCompat?) {
                dispatchResult(requestCode, android.net.Uri.fromFile(file))
            }
        }
        val owner = object : ActivityResultRegistryOwner { override val activityResultRegistry = registry }
        var dismissed = false
        rule.setContent {
            CompositionLocalProvider(LocalActivityResultRegistryOwner provides owner) {
                TasksTheme(true) { TagEditor(store, tag) { dismissed = true } }
            }
        }
        rule.onNodeWithText(" Upload logo", substring = true).performClick()
        try {
            rule.waitUntil(15_000) { rule.onAllNodesWithText("Use logo").fetchSemanticsNodes().isNotEmpty() }
        } catch (e: Throwable) {
            val texts = rule.onAllNodes(androidx.compose.ui.test.hasText("", substring = true), useUnmergedTree = true).fetchSemanticsNodes()
                .map { n -> n.config.getOrElseNullable(androidx.compose.ui.semantics.SemanticsProperties.Text) { null }?.joinToString() }
            println("TREE texts=$texts")
            throw e
        }
        rule.onNodeWithText("Use logo").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Save").performScrollTo().performClick()
        val dump = {
            rule.onAllNodes(androidx.compose.ui.test.hasText("", substring = true), useUnmergedTree = true).fetchSemanticsNodes()
                .map { n -> n.config.getOrElseNullable(androidx.compose.ui.semantics.SemanticsProperties.Text) { null }?.joinToString() }
        }
        println("AFTERSAVE ${dump()}")
        for (i in 0 until 30) { Thread.sleep(200); org.robolectric.shadows.ShadowLooper.idleMainLooper() }
        println("AFTERWAIT ${dump()}")
        rule.waitUntil(15_000) {
            val err = rule.onAllNodesWithText("Couldn't", substring = true).fetchSemanticsNodes()
            if (err.isNotEmpty()) throw AssertionError("Save failed: " + err.first().config.toString())
            dismissed
        }
        assertNotNull(runBlocking { api.tags().tags.first { it.id == tag.id }.logo })
    }
}
