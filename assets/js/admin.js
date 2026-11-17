
document.addEventListener("DOMContentLoaded", async function () {
    const tableBody = document.getElementById("applicationsTableBody");
    const message = document.getElementById("applicationMessage");
    const modal = document.getElementById("applicationModal");
    const details = document.getElementById("applicationDetails");

    let applications = [];
    let selectedApplication = null;

    const $ = id => document.getElementById(id);

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function money(value) {
        return value === null || value === undefined || value === ""
            ? "Not provided"
            : "R" + Number(value).toLocaleString("en-ZA");
    }

    function date(value) {
        if (!value) return "—";

        return new Date(value).toLocaleString("en-ZA", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    function statusLabel(status) {
        return {
            pending: "Pending",
            under_review: "Under review",
            approved: "Approved",
            rejected: "Rejected"
        }[status] || status;
    }

    function showMessage(text) {
        if (message) message.textContent = text;
    }

    async function checkAdmin() {
        const { data: sessionData, error } = await db.auth.getSession();

        if (error || !sessionData.session) {
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

        $("adminEmail").textContent = sessionData.session.user.email;
        return true;
    }

    function updateCounts() {
        $("allCount").textContent = applications.length;

        $("pendingCount").textContent =
            applications.filter(a => a.status === "pending").length;

        $("reviewCount").textContent =
            applications.filter(a => a.status === "under_review").length;

        $("approvedCount").textContent =
            applications.filter(a => a.status === "approved").length;

        $("rejectedCount").textContent =
            applications.filter(a => a.status === "rejected").length;
    }

    function renderApplications() {
        const search = $("applicationSearch").value.trim().toLowerCase();
        const status = $("statusFilter").value;

        const filtered = applications.filter(app => {
            const searchable = [
                app.property_title,
                app.full_name,
                app.phone,
                app.property_area,
                app.area_name,
                app.property_address
            ].join(" ").toLowerCase();

            return searchable.includes(search) &&
                (!status || app.status === status);
        });

        if (!filtered.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-table">
                        No applications match your search.
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = filtered.map(app => `
            <tr>
                <td>
                    <strong>${escapeHTML(app.property_title || "Untitled property")}</strong>
                    <small>${escapeHTML(app.full_name || "Landlord not provided")}</small>
                </td>

                <td>${escapeHTML(app.area_name || app.property_area || "—")}</td>
                <td>${money(app.monthly_rent)}</td>
                <td>${date(app.submitted_at)}</td>

                <td>
                    <span class="application-status status-${escapeHTML(app.status)}">
                        ${escapeHTML(statusLabel(app.status))}
                    </span>
                </td>

                <td>
                    <button class="view-application-button"
                        data-id="${escapeHTML(app.id)}">
                        View
                    </button>
                </td>
            </tr>
        `).join("");
    }

    async function loadApplications() {
        showMessage("Loading landlord applications...");

        tableBody.innerHTML =
            '<tr><td colspan="6">Loading applications...</td></tr>';

        const { data, error } = await db
            .from("landlord_applications")
            .select("*")
            .order("submitted_at", { ascending: false });

        if (error) {
            console.error(error);

            showMessage("Unable to load applications: " + error.message);

            tableBody.innerHTML =
                '<tr><td colspan="6">Could not load applications.</td></tr>';

            return;
        }

        applications = data || [];

        updateCounts();
        renderApplications();

        showMessage(`${applications.length} application(s) loaded.`);
    }

    function detailRow(label, value) {
        return `
            <div class="detail-item">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value || "Not provided")}</strong>
            </div>`;
    }

    // Create the approval button without changing the modal HTML.
    function createApprovalButton() {
        if ($("approveApplicationButton")) return;

        const reviewButton = $("markReviewButton");

        const button = document.createElement("button");

        button.type = "button";
        button.id = "approveApplicationButton";
        button.className = "approve-application-button";
        button.textContent = "Approve & Publish";

        reviewButton.insertAdjacentElement("beforebegin", button);

        button.addEventListener("click", approveApplication);
    }

    async function loadApplicationPhotos(applicationId) {
        const photoContainer = $("applicationPhotos");

        const { data: photos, error } = await db
            .from("application_photos")
            .select("storage_path, original_filename")
            .eq("application_id", applicationId);

        if (error) {
            photoContainer.textContent = "Unable to load photographs.";
            console.error(error);
            return;
        }

        if (!photos || !photos.length) {
            photoContainer.textContent = "No photographs were uploaded.";
            return;
        }

        photoContainer.innerHTML = "Loading photographs...";

        // Generate signed URLs concurrently rather than one at a time.
        const results = await Promise.all(
            photos.map(async photo => {
                const { data, error } = await db.storage
                    .from("application-photos")
                    .createSignedUrl(photo.storage_path, 3600);

                return {
                    photo,
                    url: error ? null : data?.signedUrl
                };
            })
        );

        // The administrator may have closed or changed the application.
        if (!selectedApplication ||
            selectedApplication.id !== applicationId) {
            return;
        }

        photoContainer.innerHTML = "";

        results.forEach(({ photo, url }) => {
            if (!url) return;

            const figure = document.createElement("figure");
            const image = document.createElement("img");
            const caption = document.createElement("figcaption");

            image.src = url;
            image.alt = photo.original_filename || "Property photograph";
            image.loading = "lazy";

            caption.textContent =
                photo.original_filename || "Property photograph";

            figure.append(image, caption);
            photoContainer.appendChild(figure);
        });

        if (!photoContainer.children.length) {
            photoContainer.textContent =
                "Photographs could not be displayed.";
        }
    }

    async function openApplication(id) {
        selectedApplication = applications.find(app => app.id === id);

        if (!selectedApplication) return;

        const app = selectedApplication;

        $("modalPropertyTitle").textContent =
            app.property_title || "Property application";

        $("modalMessage").textContent = "Loading application details...";
        details.innerHTML = "";

        modal.hidden = false;
        document.body.classList.add("modal-open");

        const amenities = Array.isArray(app.amenities)
            ? app.amenities
            : [];

        details.innerHTML = `
            <h3>Landlord information</h3>

            <div class="details-grid">
                ${detailRow("Full name", app.full_name)}
                ${detailRow("Phone", app.phone)}
                ${detailRow("Email", app.email)}
                ${detailRow("Preferred contact", app.preferred_contact_method)}
            </div>

            <h3>Property information</h3>

            <div class="details-grid">
                ${detailRow("Property title", app.property_title)}
                ${detailRow("Property type", app.property_type)}
                ${detailRow("Area", app.area_name || app.property_area)}
                ${detailRow("Address", app.property_address)}
                ${detailRow("Availability", app.availability)}
                ${detailRow("Monthly rent", money(app.monthly_rent))}
                ${detailRow("Deposit", money(app.deposit_amount))}
                ${detailRow("Bedrooms", app.bedrooms)}
                ${detailRow("Available units", app.available_units)}
                ${detailRow("Submitted", date(app.submitted_at))}
            </div>

            <h3>Description</h3>

            <p class="detail-description">
                ${escapeHTML(app.description || "No description provided.")}
            </p>

            <h3>Amenities</h3>

            <div class="amenity-list">
                ${amenities.length
                    ? amenities.map(item =>
                        `<span>${escapeHTML(item)}</span>`
                      ).join("")
                    : "No amenities selected."}
            </div>

            <h3>Landlord confirmations</h3>

            <div class="details-grid">
                ${detailRow("Ownership confirmed", app.ownership_confirmed ? "Yes" : "No")}
                ${detailRow("Information accuracy confirmed", app.accuracy_confirmed ? "Yes" : "No")}
                ${detailRow("Privacy consent", app.privacy_consent ? "Yes" : "No")}
            </div>

            <h3>Application photographs</h3>

            <div id="applicationPhotos" class="application-photos">
                Loading photographs...
            </div>

            <h3>Administrator notes</h3>

            <p class="detail-description">
                ${escapeHTML(app.admin_notes || "No administrator notes.")}
            </p>
        `;

        $("markReviewButton").disabled =
            app.status === "under_review" ||
            app.status === "approved" ||
            app.status === "rejected";

        $("rejectApplicationButton").disabled =
            app.status === "rejected" ||
            app.status === "approved";

        const approveButton = $("approveApplicationButton");

        approveButton.disabled =
            app.status === "approved" ||
            app.status === "rejected";

        approveButton.textContent =
            app.status === "approved"
                ? "Already Published"
                : "Approve & Publish";

        await loadApplicationPhotos(app.id);

        $("modalMessage").textContent = "";
    }

    // Approve application and publish the property through Supabase.
    async function approveApplication() {
        if (!selectedApplication) return;

        const applicationId = selectedApplication.id;
        const approveButton = $("approveApplicationButton");

        const confirmed = window.confirm(
            "Are you sure you want to approve this landlord application?\n\n" +
            "This will create a public property listing and publish its photographs."
        );

        if (!confirmed) return;

        approveButton.disabled = true;
        $("markReviewButton").disabled = true;
        $("rejectApplicationButton").disabled = true;

        $("modalMessage").textContent =
            "Approving application and publishing property photographs. Please wait...";

        try {
            const { data, error } = await db.functions.invoke(
                "approve-property",
                {
                    body: {
                        application_id: applicationId
                    }
                }
            );

            if (error) {
                console.error("Approval function error:", error);

                throw new Error(
                    data?.error ||
                    error.message ||
                    "The approval request failed."
                );
            }

            if (!data || data.success !== true) {
                throw new Error(
                    data?.error || "The application could not be approved."
                );
            }

            $("modalMessage").textContent =
                data.already_approved
                    ? "This application already has a property listing."
                    : `Application approved! Property created and ${data.photos_published} photograph(s) published.`;

            await loadApplications();

            // Reopen the updated application.
            await openApplication(applicationId);

        } catch (error) {
            console.error("Kgotlello approval error:", error);

            $("modalMessage").textContent =
                "Approval failed: " + error.message;

            approveButton.disabled = false;
            $("markReviewButton").disabled = false;
            $("rejectApplicationButton").disabled = false;
        }
    }

    async function updateStatus(status) {
        if (!selectedApplication) return;

        const applicationId = selectedApplication.id;

        const button = status === "under_review"
            ? $("markReviewButton")
            : $("rejectApplicationButton");

        button.disabled = true;
        $("modalMessage").textContent = "Updating application...";

        const { error } = await db
            .from("landlord_applications")
            .update({
                status,
                reviewed_at: new Date().toISOString()
            })
            .eq("id", applicationId);

        if (error) {
            console.error(error);

            $("modalMessage").textContent =
                "Update failed: " + error.message;

            button.disabled = false;
            return;
        }

        $("modalMessage").textContent =
            "Application status updated successfully.";

        await loadApplications();
        await openApplication(applicationId);
    }

    // Initial checks.
    if (!window.db) {
        showMessage("Database connection unavailable.");
        return;
    }

    if (!await checkAdmin()) return;

    createApprovalButton();

    // Search, filters and refresh.
    $("refreshApplications").addEventListener("click", loadApplications);

    $("applicationSearch").addEventListener("input", renderApplications);

    $("statusFilter").addEventListener("change", renderApplications);

    tableBody.addEventListener("click", event => {
        const button = event.target.closest("[data-id]");

        if (button) {
            openApplication(button.dataset.id);
        }
    });

    // Modal close.
    $("closeApplicationModal").addEventListener("click", () => {
        modal.hidden = true;
        document.body.classList.remove("modal-open");
        selectedApplication = null;
    });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.hidden = true;
            document.body.classList.remove("modal-open");
            selectedApplication = null;
        }
    });

    // Existing application actions.
    $("markReviewButton").addEventListener("click", () =>
        updateStatus("under_review")
    );

    $("rejectApplicationButton").addEventListener("click", () =>
        updateStatus("rejected")
    );

    // Logout.
    $("logoutButton").addEventListener("click", async () => {
        const { error } = await db.auth.signOut();

        if (!error) {
            window.location.replace("index.html");
        } else {
            showMessage("Unable to sign out: " + error.message);
        }
    });

    await loadApplications();
});
