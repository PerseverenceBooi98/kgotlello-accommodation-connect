
document.addEventListener("DOMContentLoaded", async function () {

    const $ = id => document.getElementById(id);
    const db = window.db;

    const tableBody = $("referralTableBody");
    const modal = $("referralModal");

    let referrals = [];
    let selectedReferralId = null;

    const FIXED_REFERRAL_FEE = 250;

    const statusLabels = {
        pending: "Pending",
        successful: "Successful",
        unsuccessful: "Unsuccessful",
        cancelled: "Cancelled"
    };

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
        return "R" + Number(value || 0).toLocaleString("en-ZA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function showMessage(text) {
        $("referralMessage").textContent = text;
    }

    async function checkAdmin() {

        const { data: sessionData, error } =
            await db.auth.getSession();

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

        $("adminEmail").textContent =
            sessionData.session.user.email || "Administrator";

        return true;
    }

    function updateSummary() {

        $("referralTotal").textContent = referrals.length;

        $("referralPending").textContent =
            referrals.filter(r => r.status === "pending").length;

        $("referralSuccessful").textContent =
            referrals.filter(r => r.status === "successful").length;

        const outstanding = referrals
            .filter(r => !r.fee_paid)
            .reduce((total, r) => total + Number(r.referral_fee || 0), 0);

        const received = referrals
            .filter(r => r.fee_paid)
            .reduce((total, r) => total + Number(r.referral_fee || 0), 0);

        $("referralOutstanding").textContent = money(outstanding);
        $("referralReceived").textContent = money(received);
    }

    function renderReferrals() {

        const search = $("referralSearch").value.trim().toLowerCase();
        const status = $("referralStatus").value;
        const payment = $("referralPayment").value;

        const filtered = referrals.filter(referral => {

            const tenant = referral.enquiries || {};
            const property = referral.properties || {};
            const landlord = referral.landlord_applications || {};

            const searchable = [
                tenant.tenant_name,
                tenant.tenant_phone,
                property.title,
                property.property_address,
                landlord.full_name,
                landlord.phone
            ].join(" ").toLowerCase();

            return searchable.includes(search) &&
                (!status || referral.status === status) &&
                (payment === "" || String(referral.fee_paid) === payment);
        });

        if (!filtered.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-table">
                        No referral records found.
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = filtered.map(referral => {

            const tenant = referral.enquiries || {};
            const property = referral.properties || {};

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(tenant.tenant_name || "Unknown tenant")}</strong>
                        <small>${escapeHTML(tenant.tenant_phone || "")}</small>
                    </td>

                    <td>${escapeHTML(property.title || "Property unavailable")}</td>

                    <td>
                        <span class="application-status status-${escapeHTML(referral.status)}">
                            ${escapeHTML(statusLabels[referral.status] || referral.status)}
                        </span>
                    </td>

                    <td>${money(referral.referral_fee)}</td>

                    <td>
                        ${referral.fee_paid
                            ? '<span class="availability-yes">Received</span>'
                            : '<span class="availability-no">Outstanding</span>'}
                    </td>

                    <td>${formatDate(referral.placement_date)}</td>

                    <td>
                        <button
                            class="view-application-button"
                            data-id="${escapeHTML(referral.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadReferrals() {

        showMessage("Loading referral records...");

        tableBody.innerHTML =
            '<tr><td colspan="7">Loading referrals...</td></tr>';

        try {

            const { data, error } = await db
                .from("referrals")
                .select(`
                    id,
                    enquiry_id,
                    property_id,
                    landlord_application_id,
                    status,
                    referral_fee,
                    fee_paid,
                    placement_date,
                    notes,
                    created_at,
                    enquiries (
                        tenant_name,
                        tenant_phone,
                        tenant_email
                    ),
                    properties (
                        title,
                        property_address
                    ),
                    landlord_applications (
                        full_name,
                        phone
                    )
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;

            referrals = data || [];

            updateSummary();
            renderReferrals();

            showMessage(
                referrals.length + " referral record(s) loaded."
            );

        } catch (error) {

            console.error("Referral loading error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        Could not load referrals. Check the browser console.
                    </td>
                </tr>`;

            showMessage(
                "Unable to load referrals: " + error.message
            );
        }
    }

    function detailRow(label, value) {
        return `
            <div class="detail-item">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value || "Not provided")}</strong>
            </div>`;
    }

    function openReferral(id) {

        const referral = referrals.find(item => item.id === id);

        if (!referral) return;

        selectedReferralId = id;

        const tenant = referral.enquiries || {};
        const property = referral.properties || {};
        const landlord = referral.landlord_applications || {};

        $("modalReferralName").textContent =
            tenant.tenant_name || "Referral details";

        $("referralDetails").innerHTML = `

            <h3>Tenant information</h3>

            <div class="details-grid">
                ${detailRow("Tenant name", tenant.tenant_name)}
                ${detailRow("Phone number", tenant.tenant_phone)}
                ${detailRow("Email address", tenant.tenant_email)}
            </div>

            <h3>Property information</h3>

            <div class="details-grid">
                ${detailRow("Property", property.title)}
                ${detailRow("Address", property.property_address)}
            </div>

            <h3>Landlord information</h3>

            <div class="details-grid">
                ${detailRow("Landlord", landlord.full_name)}
                ${detailRow("Landlord phone", landlord.phone)}
            </div>

            <h3>Referral information</h3>

            <div class="details-grid">
                ${detailRow("Referral date", formatDate(referral.created_at))}
                ${detailRow("Referral status", statusLabels[referral.status] || referral.status)}
                ${detailRow("Referral fee", money(referral.referral_fee))}
                ${detailRow("Payment", referral.fee_paid ? "Received" : "Outstanding")}
                ${detailRow("Placement date", formatDate(referral.placement_date))}
            </div>

            <h3>Administrative notes</h3>
            <p>${escapeHTML(referral.notes || "No notes recorded.")}</p>
        `;

        $("referralStatusUpdate").value = referral.status || "pending";

        // The initial referral fee is fixed at R250.
        $("referralFee").value = String(FIXED_REFERRAL_FEE);
        $("referralFee").disabled = true;

        $("referralPaymentStatus").value =
            String(referral.fee_paid === true);

        $("referralPlacementDate").value =
            referral.placement_date
                ? referral.placement_date.substring(0, 10)
                : "";

        $("referralNotes").value = referral.notes || "";

        $("referralModalMessage").textContent = "";

        modal.hidden = false;
        document.body.classList.add("modal-open");
    }

    async function saveReferral() {

        if (!selectedReferralId) return;

        const referral = referrals.find(
            item => item.id === selectedReferralId
        );

        if (!referral) return;

        const status = $("referralStatusUpdate").value;
        const feePaid =
            $("referralPaymentStatus").value === "true";

        const placementDate =
            $("referralPlacementDate").value || null;

        const notes = $("referralNotes").value.trim();

        if (feePaid && status !== "successful") {
            $("referralModalMessage").textContent =
                "A referral must be marked Successful before recording payment.";
            return;
        }

        if (status === "successful" && !placementDate) {
            $("referralModalMessage").textContent =
                "Please enter the placement date for a successful referral.";
            return;
        }

        const button = $("saveReferral");

        button.disabled = true;
        button.textContent = "Saving...";

        try {

            const { error } = await db
                .from("referrals")
                .update({
                    status: status,
                    referral_fee: FIXED_REFERRAL_FEE,
                    fee_paid: feePaid,
                    placement_date: placementDate,
                    notes: notes
                })
                .eq("id", selectedReferralId);

            if (error) throw error;

            $("referralModalMessage").textContent =
                "Referral updated successfully.";

            await loadReferrals();

            const updated = referrals.find(
                item => item.id === selectedReferralId
            );

            if (updated) {
                $("referralStatusUpdate").value = updated.status;
                $("referralPaymentStatus").value =
                    String(updated.fee_paid);
            }

        } catch (error) {

            console.error("Referral update error:", error);

            $("referralModalMessage").textContent =
                "Unable to save referral: " + error.message;

        } finally {

            button.disabled = false;
            button.textContent = "Save Referral";
        }
    }

    if (!db) {
        showMessage("Database connection unavailable. Check supabase.js.");
        return;
    }

    try {

        if (!await checkAdmin()) return;

        $("refreshReferrals").addEventListener(
            "click",
            loadReferrals
        );

        $("referralSearch").addEventListener(
            "input",
            renderReferrals
        );

        $("referralStatus").addEventListener(
            "change",
            renderReferrals
        );

        $("referralPayment").addEventListener(
            "change",
            renderReferrals
        );

        tableBody.addEventListener("click", event => {

            const button = event.target.closest("[data-id]");

            if (button) {
                openReferral(button.dataset.id);
            }
        });

        $("saveReferral").addEventListener(
            "click",
            saveReferral
        );

        $("closeReferralModal").addEventListener("click", () => {
            modal.hidden = true;
            document.body.classList.remove("modal-open");
            selectedReferralId = null;
        });

        modal.addEventListener("click", event => {

            if (event.target === modal) {
                modal.hidden = true;
                document.body.classList.remove("modal-open");
                selectedReferralId = null;
            }
        });

        $("logoutButton").addEventListener("click", async () => {

            const { error } = await db.auth.signOut();

            if (!error) {
                window.location.replace("index.html");
            } else {
                showMessage("Unable to sign out: " + error.message);
            }
        });

        await loadReferrals();

    } catch (error) {

        console.error("Referral dashboard initialisation error:", error);

        showMessage(
            "Unable to initialise referral dashboard: " + error.message
        );
    }
});

