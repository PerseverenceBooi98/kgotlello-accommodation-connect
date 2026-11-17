
document.addEventListener("DOMContentLoaded", async function () {
    const message = document.getElementById("dashboardMessage");
    const logoutButton = document.getElementById("logoutButton");
    const refreshButton = document.getElementById("refreshDashboard");

    function showMessage(text) {
        message.textContent = text;
    }

    async function checkAdminAccess() {
        const { data: sessionData, error: sessionError } =
            await db.auth.getSession();

        if (sessionError || !sessionData.session) {
            window.location.replace("index.html");
            return false;
        }

        const { data: isAdmin, error: adminError } =
            await db.rpc("is_admin");

        if (adminError || isAdmin !== true) {
            await db.auth.signOut();
            window.location.replace("index.html");
            return false;
        }

        document.getElementById("adminEmail").textContent =
            sessionData.session.user.email;

        return true;
    }

    async function getCount(table, filters = []) {
        let query = db.from(table).select("*", {
            count: "exact",
            head: true
        });

        filters.forEach(([column, operator, value]) => {
            query = query[operator](column, value);
        });

        const { count, error } = await query;

        if (error) throw error;

        return count ?? 0;
    }

    async function loadDashboard() {
        showMessage("Loading dashboard information...");

        try {
            const [
                applications,
                pending,
                properties,
                enquiries,
                referrals
            ] = await Promise.all([
                getCount("landlord_applications"),
                getCount("landlord_applications", [
                    ["status", "eq", "pending"]
                ]),
                getCount("properties", [
                    ["status", "eq", "approved"],
                    ["available", "eq", true]
                ]),
                getCount("enquiries"),
                getCount("referrals", [
                    ["status", "eq", "successful"]
                ])
            ]);

            document.getElementById("totalApplications").textContent = applications;
            document.getElementById("pendingApplications").textContent = pending;
            document.getElementById("approvedProperties").textContent = properties;
            document.getElementById("totalEnquiries").textContent = enquiries;
            document.getElementById("successfulReferrals").textContent = referrals;

            showMessage("Dashboard information updated successfully.");

        } catch (error) {
            console.error("Dashboard loading error:", error);
            showMessage("Unable to load dashboard information: " + error.message);
        }
    }

    if (!window.db) {
        showMessage("Database connection unavailable.");
        return;
    }

    const authorised = await checkAdminAccess();

    if (!authorised) return;

    await loadDashboard();

    refreshButton.addEventListener("click", loadDashboard);

    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;

        const { error } = await db.auth.signOut();

        if (error) {
            console.error(error);
            logoutButton.disabled = false;
            showMessage("Unable to sign out. Please try again.");
            return;
        }

        window.location.replace("index.html");
    });
});
