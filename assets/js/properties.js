

document.addEventListener("DOMContentLoaded", async function () {
    const $ = id => document.getElementById(id);

    const tableBody = $("propertyTableBody");
    const modal = $("propertyModal");
    const details = $("propertyDetails");

    let properties = [];

    const facilityLabels = {
        furnished: "Furnished",
        parking: "Parking",
        water_included: "Water included",
        electricity_included: "Electricity included",
        wifi: "Wi-Fi",
        private_bathroom: "Private bathroom"
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
        return value === null || value === undefined
            ? "Not provided"
            : "R" + Number(value).toLocaleString("en-ZA");
    }

    function statusLabel(status) {
        return {
            pending: "Pending",
            approved: "Approved",
            rejected: "Rejected",
            let: "Let",
            withdrawn: "Withdrawn"
        }[status] || status || "Unknown";
    }

    function date(value) {
        if (!value) return "—";

        return new Date(value).toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function showMessage(text) {
        $("propertyMessage").textContent = text;
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

    function updateSummary() {
        $("propertyTotal").textContent = properties.length;

        $("propertyApproved").textContent =
            properties.filter(p => p.status === "approved").length;

        $("propertyAvailable").textContent =
            properties.filter(p =>
                p.status === "approved" && p.available === true
            ).length;

        $("propertyLet").textContent =
            properties.filter(p => p.status === "let").length;

        $("propertyWithdrawn").textContent =
            properties.filter(p => p.status === "withdrawn").length;
    }

    function renderProperties() {
        const search = $("propertySearch").value.trim().toLowerCase();
        const status = $("propertyStatus").value;
        const availability = $("propertyAvailability").value;

        const filtered = properties.filter(property => {
            const areaName = property.approved_areas?.name || "";

            const searchable = [
                property.title,
                property.property_address,
                property.property_type,
                areaName,
                property.description
            ].join(" ").toLowerCase();

            return searchable.includes(search) &&
                (!status || property.status === status) &&
                (availability === "" ||
                    String(property.available) === availability);
        });

        if (!filtered.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-table">
                        No properties match your search.
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = filtered.map(property => {
            const area = property.approved_areas?.name || "Area not specified";

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(property.title || "Untitled property")}</strong>
                        <small>Added ${date(property.created_at)}</small>
                    </td>

                    <td>${escapeHTML(area)}</td>
                    <td>${escapeHTML(property.property_type || "—")}</td>
                    <td>${money(property.monthly_rent)}</td>

                    <td>
                        ${property.available
                            ? '<span class="availability-yes">Available</span>'
                            : '<span class="availability-no">Unavailable</span>'}
                    </td>

                    <td>
                        <span class="application-status status-${escapeHTML(property.status)}">
                            ${escapeHTML(statusLabel(property.status))}
                        </span>
                    </td>

                    <td>
                        <button class="view-application-button"
                            data-id="${escapeHTML(property.id)}">
                            View
                        </button>
                    </td>
                </tr>`;
        }).join("");
    }

    async function loadProperties() {
        showMessage("Loading property records...");

        tableBody.innerHTML =
            '<tr><td colspan="7">Loading properties...</td></tr>';

        const { data, error } = await db
            .from("properties")
            .select(`
                id,
                application_id,
                title,
                description,
                area_id,
                property_address,
                property_type,
                monthly_rent,
                furnished,
                parking,
                water_included,
                electricity_included,
                wifi,
                private_bathroom,
                available,
                status,
                created_at,
                approved_areas(name)
            `)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Property loading error:", error);

            showMessage("Unable to load properties: " + error.message);

            tableBody.innerHTML =
                '<tr><td colspan="7">Could not load properties.</td></tr>';

            return;
        }

        properties = data || [];

        updateSummary();
        renderProperties();

        showMessage(properties.length + " property record(s) loaded.");
    }

    function detailRow(label, value) {
        return `
            <div class="detail-item">
                <span>${escapeHTML(label)}</span>
                <strong>${escapeHTML(value || "Not provided")}</strong>
            </div>`;
    }

    async function openProperty(id) {
        const property = properties.find(item => item.id === id);
        if (!property) return;

        $("modalPropertyName").textContent =
            property.title || "Property details";

        details.innerHTML = `
            <h3>Property information</h3>

            <div class="details-grid">
                ${detailRow("Property title", property.title)}
                ${detailRow("Property type", property.property_type)}
                ${detailRow("Area", property.approved_areas?.name)}
                ${detailRow("Address", property.property_address)}
                ${detailRow("Monthly rent", money(property.monthly_rent))}
                ${detailRow("Status", statusLabel(property.status))}
                ${detailRow("Availability", property.available ? "Available" : "Unavailable")}
                ${detailRow("Date added", date(property.created_at))}
            </div>

            <h3>Description</h3>
            <p class="detail-description">
                ${escapeHTML(property.description || "No description provided.")}
            </p>

            <h3>Facilities and amenities</h3>
            <div class="amenity-list" id="propertyAmenities"></div>

            <h3>Property photographs</h3>
            <div class="application-photos" id="propertyPhotos">
                Loading photographs...
            </div>
        `;

        const amenityContainer = $("propertyAmenities");

        const selectedFacilities = Object.entries(facilityLabels)
            .filter(([key]) => property[key] === true)
            .map(([, label]) => label);

        if (selectedFacilities.length) {
            amenityContainer.innerHTML = selectedFacilities
                .map(item => `<span>${escapeHTML(item)}</span>`)
                .join("");
        } else {
            amenityContainer.textContent = "No facilities recorded.";
        }

        modal.hidden = false;
        document.body.classList.add("modal-open");

        const photoContainer = $("propertyPhotos");

        const { data: photos, error } = await db
            .from("property_photos")
            .select("storage_path, is_cover, display_order")
            .eq("property_id", property.id)
            .order("display_order", { ascending: true });

        if (error) {
            console.error("Property photo loading error:", error);
            photoContainer.textContent =
                "Unable to retrieve property photographs.";
            return;
        }

        if (!photos || !photos.length) {
            photoContainer.textContent =
                "No public property photographs are available.";
            return;
        }

        photoContainer.innerHTML = "";

        photos.forEach(photo => {
            const { data } = db.storage
                .from("property-images")
                .getPublicUrl(photo.storage_path);

            if (!data?.publicUrl) return;

            const figure = document.createElement("figure");
            const image = document.createElement("img");

            image.src = data.publicUrl;
            image.alt = "Property photograph";
            image.loading = "lazy";

            figure.appendChild(image);
            photoContainer.appendChild(figure);
        });
    }

    if (!window.db) {
        showMessage("Database connection unavailable.");
        return;
    }

    if (!await checkAdmin()) return;

    $("refreshProperties").addEventListener("click", loadProperties);
    $("propertySearch").addEventListener("input", renderProperties);
    $("propertyStatus").addEventListener("change", renderProperties);
    $("propertyAvailability").addEventListener("change", renderProperties);

    tableBody.addEventListener("click", event => {
        const button = event.target.closest("[data-id]");

        if (button) openProperty(button.dataset.id);
    });

    $("closePropertyModal").addEventListener("click", () => {
        modal.hidden = true;
        document.body.classList.remove("modal-open");
    });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.hidden = true;
            document.body.classList.remove("modal-open");
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

    await loadProperties();
});
