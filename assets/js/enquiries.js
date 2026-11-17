
document.addEventListener("DOMContentLoaded", async () => {
    const db = window.db;

    const tableBody = document.getElementById("enquiryTableBody");
    const message = document.getElementById("enquiryMessage");
    const totalCount = document.getElementById("enquiryTotal");
    const newCount = document.getElementById("enquiryNew");
    const contactedCount = document.getElementById("enquiryContacted");
    const viewingCount = document.getElementById("enquiryViewing");
    const successfulCount = document.getElementById("enquirySuccessful");

    const searchInput = document.getElementById("enquirySearch");
    const statusFilter = document.getElementById("enquiryStatus");
    const refreshButton = document.getElementById("refreshEnquiries");

    const modal = document.getElementById("enquiryModal");
    const modalName = document.getElementById("modalEnquiryName");
    const modalDetails = document.getElementById("enquiryDetails");
    const modalStatus = document.getElementById("enquiryStatusUpdate");
    const closeModalButton = document.getElementById("closeEnquiryModal");
    const saveStatusButton = document.getElementById("saveEnquiryStatus");
    const modalMessage = document.getElementById("enquiryModalMessage");

    // Initial referral fee. Keep this aligned with the database setting.
    const REFERRAL_FEE = 250.00;

    let enquiries = [];
    let selectedEnquiry = null;

    function showMessage(text, type = "info") {
        message.textContent = text;
        message.className = `dashboard-message ${type}`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatDate(value) {
        if (!value) return "Not provided";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "Not provided";

        return date.toLocaleDateString("en-ZA", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function statusLabel(status) {
        const labels = {
            new: "New",
            contacted: "Contacted",
            viewing_arranged: "Viewing Arranged",
            successful: "Successful",
            unsuccessful: "Unsuccessful",
            closed: "Closed"
        };

        return labels[status] || status;
    }

    function updateCounters() {
        totalCount.textContent = enquiries.length;
        newCount.textContent = enquiries.filter(e => e.status === "new").length;
        contactedCount.textContent = enquiries.filter(e => e.status === "contacted").length;
        viewingCount.textContent = enquiries.filter(e => e.status === "viewing_arranged").length;
        successfulCount.textContent = enquiries.filter(e => e.status === "successful").length;
    }

    function renderEnquiries() {
        const search = searchInput.value.trim().toLowerCase();
        const selectedStatus = statusFilter.value;

        const filtered = enquiries.filter(enquiry => {
            const property = enquiry.properties || {};

            const searchableText = [
                enquiry.tenant_name,
                enquiry.tenant_phone,
                enquiry.tenant_email,
                property.title,
                property.property_address
            ].join(" ").toLowerCase();

            const matchesSearch = searchableText.includes(search);
            const matchesStatus =
                !selectedStatus || enquiry.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        if (!filtered.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">No enquiries found.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map(enquiry => {
            const property = enquiry.properties || {};

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(enquiry.tenant_name)}</strong>
                        <small>${escapeHTML(enquiry.tenant_email || "No email")}</small>
                    </td>

                    <td>${escapeHTML(enquiry.tenant_phone)}</td>

                    <td>${escapeHTML(property.title || "Property unavailable")}</td>

                    <td>${formatDate(enquiry.preferred_move_in)}</td>

                    <td>${formatDate(enquiry.submitted_at)}</td>

                    <td>
                        <span class="status-badge status-${escapeHTML(enquiry.status)}">
                            ${escapeHTML(statusLabel(enquiry.status))}
                        </span>
                    </td>

                    <td>
                        <button
                            class="secondary-button view-enquiry"
                            data-id="${escapeHTML(enquiry.id)}"
                        >
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // Create a referral only when an enquiry is marked successful.
    // Check first to prevent duplicate referrals for the same enquiry.
    async function createReferralIfMissing(enquiry) {
        const property = enquiry.properties || {};

        if (!property.id) {
            throw new Error("The property linked to this enquiry could not be found.");
        }

        const { data: existingReferral, error: lookupError } = await db
            .from("referrals")
            .select("id")
            .eq("enquiry_id", enquiry.id)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingReferral) {
            return {
                created: false,
                message: "A referral record already exists for this enquiry."
            };
        }

        const referralRecord = {
            enquiry_id: enquiry.id,
            property_id: property.id,
            landlord_application_id: property.application_id || null,
            status: "pending",
            referral_fee: REFERRAL_FEE,
            fee_paid: false
        };

        const { error: insertError } = await db
            .from("referrals")
            .insert(referralRecord);

        if (insertError) {
            // A second request may have created it between our check and insert.
            if (insertError.code === "23505") {
                return {
                    created: false,
                    message: "A referral record already exists for this enquiry."
                };
            }

            throw insertError;
        }

        return {
            created: true,
            message: "Referral record created successfully."
        };
    }

    async function loadEnquiries() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7">Loading enquiries...</td>
            </tr>
        `;

        showMessage("Loading tenant enquiries...");

        try {
            const { data, error } = await db
                .from("enquiries")
                .select(`
                    *,
                    properties (
                        id,
                        application_id,
                        title,
                        property_address,
                        monthly_rent,
                        property_type
                    )
                `)
                .order("submitted_at", { ascending: false });

            if (error) throw error;

            enquiries = data || [];

            updateCounters();
            renderEnquiries();

            showMessage(
                `${enquiries.length} enquiry record(s) loaded successfully.`
            );

        } catch (error) {
            console.error("Enquiry loading error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        Could not load enquiries. Check the browser console.
                    </td>
                </tr>
            `;

            showMessage(
                error.message || "Unable to load enquiries.",
                "error"
            );
        }
    }

    function openEnquiry(enquiry) {
        selectedEnquiry = enquiry;

        const property = enquiry.properties || {};

        modalName.textContent = enquiry.tenant_name;
        modalStatus.value = enquiry.status;

        modalDetails.innerHTML = `
            <div class="detail-item">
                <strong>Tenant name</strong>
                <span>${escapeHTML(enquiry.tenant_name)}</span>
            </div>

            <div class="detail-item">
                <strong>Contact number</strong>
                <span>${escapeHTML(enquiry.tenant_phone)}</span>
            </div>

            <div class="detail-item">
                <strong>Email address</strong>
                <span>${escapeHTML(enquiry.tenant_email || "Not provided")}</span>
            </div>

            <div class="detail-item">
                <strong>Property</strong>
                <span>${escapeHTML(property.title || "Unavailable")}</span>
            </div>

            <div class="detail-item">
                <strong>Property address</strong>
                <span>${escapeHTML(property.property_address || "Not provided")}</span>
            </div>

            <div class="detail-item">
                <strong>Monthly rent</strong>
                <span>${property.monthly_rent != null
                    ? "R" + Number(property.monthly_rent).toLocaleString("en-ZA")
                    : "Not available"}</span>
            </div>

            <div class="detail-item">
                <strong>Preferred move-in</strong>
                <span>${formatDate(enquiry.preferred_move_in)}</span>
            </div>

            <div class="detail-item">
                <strong>Date received</strong>
                <span>${formatDate(enquiry.submitted_at)}</span>
            </div>

            <div class="detail-item">
                <strong>Tenant message</strong>
                <p>${escapeHTML(enquiry.message || "No message provided.")}</p>
            </div>
        `;

        modalMessage.textContent = "";
        modal.hidden = false;
    }

    tableBody.addEventListener("click", event => {
        const button = event.target.closest(".view-enquiry");

        if (!button) return;

        const enquiry = enquiries.find(
            item => item.id === button.dataset.id
        );

        if (enquiry) openEnquiry(enquiry);
    });

    closeModalButton.addEventListener("click", () => {
        modal.hidden = true;
        selectedEnquiry = null;
    });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.hidden = true;
            selectedEnquiry = null;
        }
    });

    saveStatusButton.addEventListener("click", async () => {
        if (!selectedEnquiry) return;

        const enquiryId = selectedEnquiry.id;
        const newStatus = modalStatus.value;

        saveStatusButton.disabled = true;
        modalMessage.textContent = "Saving status...";

        try {
            const { error } = await db
                .from("enquiries")
                .update({ status: newStatus })
                .eq("id", enquiryId);

            if (error) throw error;

            // Reload the enquiry so the referral uses current property details.
            await loadEnquiries();

            selectedEnquiry = enquiries.find(
                item => item.id === enquiryId
            ) || null;

            if (!selectedEnquiry) {
                modal.hidden = true;
                return;
            }

            modalStatus.value = selectedEnquiry.status;

            if (newStatus === "successful") {
                modalMessage.textContent = "Enquiry updated. Checking referral record...";

                try {
                    const referralResult =
                        await createReferralIfMissing(selectedEnquiry);

                    modalMessage.textContent = referralResult.created
                        ? "Enquiry successful. R250 referral record created and marked as unpaid."
                        : "Enquiry successful. " + referralResult.message;

                } catch (referralError) {
                    console.error("Referral creation error:", referralError);

                    modalMessage.textContent =
                        "Enquiry status was saved, but referral creation failed: " +
                        referralError.message +
                        ". Please try saving the successful status again or check the referral permissions.";
                }
            } else {
                modalMessage.textContent = "Enquiry status updated successfully.";
            }

        } catch (error) {
            console.error("Status update error:", error);

            modalMessage.textContent =
                error.message || "Could not update enquiry status.";

        } finally {
            saveStatusButton.disabled = false;
        }
    });

    searchInput.addEventListener("input", renderEnquiries);
    statusFilter.addEventListener("change", renderEnquiries);
    refreshButton.addEventListener("click", loadEnquiries);

    // Confirm admin session before loading private records.
    try {
        if (!db) {
            throw new Error("Supabase client was not initialised.");
        }

        const { data: sessionData, error: sessionError } =
            await db.auth.getSession();

        if (sessionError) throw sessionError;

        if (!sessionData.session) {
            window.location.href = "index.html";
            return;
        }

        const { data: isAdmin, error: adminError } =
            await db.rpc("is_admin");

        if (adminError) throw adminError;

        if (!isAdmin) {
            await db.auth.signOut();
            window.location.href = "index.html";
            return;
        }

        const adminEmail = document.getElementById("adminEmail");

        if (adminEmail) {
            adminEmail.textContent =
                sessionData.session.user.email || "Administrator";
        }

        await loadEnquiries();

    } catch (error) {
        console.error("Admin enquiry initialisation error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    Unable to initialise the enquiry dashboard.
                </td>
            </tr>
        `;

        showMessage(
            error.message || "Admin initialisation failed.",
            "error"
        );
    }
});
