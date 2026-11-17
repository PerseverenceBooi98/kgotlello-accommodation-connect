
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("adminLoginForm");
    const button = document.getElementById("loginButton");
    const message = document.getElementById("loginMessage");

    if (!form || !window.db) {
        console.error("Admin login could not initialise.");
        return;
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = type || "";
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        button.disabled = true;
        button.textContent = "Signing in...";
        showMessage("", "");

        try {
            const { data, error } = await db.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            const { data: isAdmin, error: adminError } =
                await db.rpc("is_admin");

            if (adminError || isAdmin !== true) {
                await db.auth.signOut();
                throw new Error("This account is not authorised for administration.");
            }

            showMessage("Login successful. Opening dashboard...", "success");

            window.location.href = "dashboard.html";

        } catch (error) {
            console.error("Admin login error:", error);

            showMessage(
                error.message || "Unable to sign in. Please try again.",
                "error"
            );

            button.disabled = false;
            button.textContent = "Sign In";
        }
    });
});
