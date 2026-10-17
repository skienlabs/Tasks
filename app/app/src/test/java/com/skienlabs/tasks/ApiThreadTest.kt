package com.skienlabs.tasks

import com.skienlabs.tasks.data.HttpTasksApi
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.FilterInputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.TimeUnit
import javax.net.SocketFactory

/**
 * Android refuses socket reads on the main thread (NetworkOnMainThreadException). The JVM doesn't,
 * so this test does it instead: any socket read on the thread that called the API fails.
 * Regression: saving a tag that already has a logo read the (large, still streaming) reply there.
 */
class ApiThreadTest {
    private val server = MockWebServer()
    @Volatile private var callerThread: Thread? = null

    private inner class GuardedSocket : Socket() {
        override fun getInputStream(): InputStream = object : FilterInputStream(super.getInputStream()) {
            private fun check() {
                if (Thread.currentThread() === callerThread) throw IllegalStateException("NetworkOnMainThreadException")
            }
            override fun read(): Int { check(); return super.read() }
            override fun read(b: ByteArray, off: Int, len: Int): Int { check(); return super.read(b, off, len) }
        }
    }

    private val factory = object : SocketFactory() {
        override fun createSocket(): Socket = GuardedSocket()
        override fun createSocket(host: String?, port: Int) = throw UnsupportedOperationException()
        override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int) = throw UnsupportedOperationException()
        override fun createSocket(host: InetAddress?, port: Int) = throw UnsupportedOperationException()
        override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int) = throw UnsupportedOperationException()
    }

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    @Test fun largeTagReplyIsReadOffTheCallingThread() = runBlocking {
        val logo = "data:image/webp;base64," + "A".repeat(58_000)
        server.enqueue(
            MockResponse.Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body("""{"id":"t1","name":"Personal","color":"blue","logo":"$logo"}""")
                .throttleBody(4096, 5, TimeUnit.MILLISECONDS) // arrives in pieces, like a phone network
                .build(),
        )
        val client = OkHttpClient.Builder().socketFactory(factory).build()
        val api = HttpTasksApi(server.url("/").toString().trimEnd('/'), { "token" }, client)
        callerThread = Thread.currentThread()
        val tag = api.updateTag("t1", buildJsonObject { put("logo", logo) })
        assertEquals(logo, tag.logo)
    }
}
