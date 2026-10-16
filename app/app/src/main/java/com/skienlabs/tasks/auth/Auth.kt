package com.skienlabs.tasks.auth

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.skienlabs.tasks.data.TokenProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.tasks.await

data class AuthUser(val uid: String, val email: String?, val name: String?, val photoUrl: String?)

class AuthException(message: String) : Exception(message)

/** Firebase sign-in: Google (Credential Manager) or email + password. */
class Auth(private val context: Context) : TokenProvider {
    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
    private var signUpName = "" // remembered so the welcome screen can prefill it

    val currentUser: AuthUser? get() = auth.currentUser?.let { AuthUser(it.uid, it.email, it.displayName, it.photoUrl?.toString()) }

    /** Emits the signed-in user (or null) now and on every change. */
    val user: Flow<AuthUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { a ->
            trySend(a.currentUser?.let { AuthUser(it.uid, it.email, it.displayName, it.photoUrl?.toString()) })
        }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }.distinctUntilChanged { a, b -> a?.uid == b?.uid }

    override suspend fun token(force: Boolean): String? = auth.currentUser?.getIdToken(force)?.await()?.token

    fun suggestedName(): String = auth.currentUser?.displayName?.takeIf { it.isNotBlank() } ?: signUpName

    @SuppressLint("DiscouragedApi")
    private fun webClientId(): String? {
        // Generated from google-services.json by the Google Services plugin.
        val id = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
        return if (id == 0) null else context.getString(id)
    }

    suspend fun signInWithGoogle(activity: Activity) {
        val clientId = webClientId() ?: throw AuthException("Google sign-in isn't set up in this build (missing web client ID).")
        val credentialManager = CredentialManager.create(activity)
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(clientId).build())
            .build()
        val result = try {
            credentialManager.getCredential(activity, request)
        } catch (e: GetCredentialCancellationException) {
            return // the user closed the sheet
        } catch (e: NoCredentialException) {
            throw AuthException("No Google account found on this phone. Add one in Settings > Accounts.")
        } catch (e: GetCredentialException) {
            throw AuthException(e.message ?: "Google sign-in failed. Please try again.")
        }
        val credential = result.credential
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw AuthException("Google sign-in returned an unexpected response.")
        }
        val idToken = try {
            GoogleIdTokenCredential.createFrom(credential.data).idToken
        } catch (e: Exception) {
            throw AuthException("Google sign-in returned an unexpected response.")
        }
        firebase { auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await() }
    }

    suspend fun signInWithEmail(email: String, password: String) {
        firebase { auth.signInWithEmailAndPassword(email.trim(), password).await() }
    }

    suspend fun signUpWithEmail(name: String, email: String, password: String) {
        signUpName = name.trim()
        firebase {
            val user = auth.createUserWithEmailAndPassword(email.trim(), password).await().user ?: return@firebase
            user.updateProfile(UserProfileChangeRequest.Builder().setDisplayName(signUpName).build()).await()
            user.getIdToken(true).await() // so the server sees the name right away
            runCatching { user.sendEmailVerification().await() } // best effort; can be resent from Account
        }
    }

    suspend fun resetPassword(email: String) {
        firebase { auth.sendPasswordResetEmail(email.trim()).await() }
    }

    suspend fun resendVerification() {
        val user = auth.currentUser ?: return
        firebase { user.sendEmailVerification().await() }
    }

    /** After the user opened the link in the email: refresh so the server sees the new status. */
    suspend fun refreshUser() {
        val user = auth.currentUser ?: return
        firebase {
            user.reload().await()
            user.getIdToken(true).await()
        }
    }

    suspend fun signOut() {
        auth.signOut()
        runCatching { CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest()) }
    }

    private suspend fun <T> firebase(block: suspend () -> T): T = try {
        block()
    } catch (e: Exception) {
        throw AuthException(describe(e))
    }

    private fun describe(e: Exception): String = when (e) {
        is FirebaseAuthUserCollisionException ->
            "An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with it."
        is FirebaseAuthWeakPasswordException -> "Choose a stronger password (at least 8 characters)."
        is FirebaseAuthInvalidUserException ->
            if (e.errorCode == "ERROR_USER_DISABLED") "This account has been disabled."
            else "Email or password is incorrect. If you signed up with Google, use Continue with Google."
        is FirebaseAuthInvalidCredentialsException ->
            if (e.errorCode == "ERROR_INVALID_EMAIL") "That email address doesn’t look right."
            else "Email or password is incorrect. If you signed up with Google, use Continue with Google."
        is FirebaseTooManyRequestsException -> "Too many attempts. Wait a moment and try again."
        is FirebaseNetworkException -> "Network error. Check your connection and try again."
        is FirebaseAuthException -> when (e.errorCode) {
            "ERROR_OPERATION_NOT_ALLOWED" -> "This sign-in method is not enabled in Firebase Authentication."
            else -> e.message ?: "Sign-in failed. Please try again."
        }
        else -> e.message ?: "Something went wrong. Please try again."
    }
}
