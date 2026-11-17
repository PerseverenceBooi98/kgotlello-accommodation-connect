
/* =====================================================
   KGOTLELLO
   LIVE ACCOMMODATION DIRECTORY
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const filterForm = document.getElementById("filterForm");
    const propertyGrid = document.getElementById("propertyGrid");
    const emptyState = document.getElementById("emptyState");
    const resultsCount = document.getElementById("resultsCount");
    const resetButton = document.getElementById("resetFilters");
    const sortListings = document.getElementById("sortListings");

    if (!filterForm || !propertyGrid || typeof db === "undefined") {
        console.error("Kgotlello: Required page elements or Supabase client missing.");
        return;
    }

    const areaInput = document.getElementById("filterArea");
    const typeInput = document.getElementById("filterType");
    const minPriceInput = document.getElementById("minPrice");
    const maxPriceInput = document.getElementById("maxPrice");

    let properties = [];

    // -------------------------------------------------
    // LOAD PROPERTIES
    // -------------------------------------------------

    
    async function loadProperties() {

console.log("LOAD PROPERTIES FUNCTION STARTED");
        propertyGrid.innerHTML = "<p>Loading available accommodation...</p>";
        if (emptyState) emptyState.hidden = true;

        try {

                       const { data, error } = await db
                .from("properties")
                .select(`
                    id,
                    title,
                    description,
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
                .eq("status", "approved")
                .eq("available", true)
                .order("created_at", { ascending: false });

            console.log("PROPERTY QUERY RESULT:", {
                data: data,
                error: error
            });

            if (error) throw error;

            properties = data || [];

            if (properties.length > 0) {

                const ids = properties.map(property => property.id);

                const { data: photos, error: photoError } = await db
                    .from("property_photos")
                    .select("property_id, storage_path, is_cover, display_order")
                    .in("property_id", ids);

                if (photoError) throw photoError;

                properties.forEach(property => {

                    const propertyPhotos = (photos || [])
                        .filter(photo => photo.property_id === property.id)
                        .sort((a, b) => {

                            if (a.is_cover !== b.is_cover) {
                                return a.is_cover ? -1 : 1;
                            }

                            return (a.display_order || 0) -
                                   (b.display_order || 0);
                        });

                    property.photo = propertyPhotos.length
                        ? db.storage
                            .from("property-images")
                            .getPublicUrl(propertyPhotos[0].storage_path)
                            .data.publicUrl
                        : null;

                });

            }

            renderProperties();

        } catch (error) {

            console.error("Kgotlello directory error:", error);

            propertyGrid.innerHTML = `
                <p class="directory-error">
                    We could not load accommodation.
                    Please refresh the page.
                </p>
            `;

            if (resultsCount) {
                resultsCount.textContent = "Unable to load properties";
            }

        }

    }

    

    // -------------------------------------------------
    // CREATE PROPERTY CARD
    // -------------------------------------------------

    function createPropertyCard(property) {

        const area = property.approved_areas?.name || "Mahikeng";

        const card = document.createElement("article");
        card.className = "property-card";
        card.dataset.propertyCard = "";

        card.dataset.area = area.toLowerCase();
        card.dataset.type = property.property_type.toLowerCase();
        card.dataset.price = property.monthly_rent;
        card.dataset.date = property.created_at || "";

        card.dataset.furnished = String(property.furnished);
        card.dataset.parking = String(property.parking);
        card.dataset.water = String(property.water_included);
        card.dataset.electricity = String(property.electricity_included);
        card.dataset.wifi = String(property.wifi);
        card.dataset.privateBathroom = String(property.private_bathroom);

        // Image
        const imageWrapper = document.createElement("div");
        imageWrapper.className = "property-card-image";

        const image = document.createElement("img");
        image.src = property.photo || "assets/images/property-placeholder.jpg";
        image.alt = property.title;
        image.loading = "lazy";

        image.onerror = function () {
            this.onerror = null;
            this.src = "assets/images/property-placeholder.jpg";
        };

        imageWrapper.appendChild(image);

        // Content
        const content = document.createElement("div");
        content.className = "property-card-content";

        const heading = document.createElement("h3");
        heading.textContent = property.title;

        const location = document.createElement("p");
        location.className = "property-card-location";
        location.textContent = "⌖ " + area;

        const price = document.createElement("p");
        price.className = "property-price";

        price.textContent =
            "R" + Number(property.monthly_rent).toLocaleString("en-ZA");

        const monthly = document.createElement("small");
        monthly.textContent = " / month";
        price.appendChild(monthly);

        const features = document.createElement("div");
        features.className = "property-features";

        const featureLabels = [
            ["furnished", "Furnished"],
            ["parking", "Parking"],
            ["water_included", "Water included"],
            ["electricity_included", "Electricity included"],
            ["wifi", "Wi-Fi"],
            ["private_bathroom", "Private bathroom"]
        ];

        featureLabels.forEach(([field, label]) => {

            if (property[field]) {
                const feature = document.createElement("span");
                feature.className = "property-feature";
                feature.textContent = label;
                features.appendChild(feature);
            }

        });

        const link = document.createElement("a");
        link.className = "property-card-link";
        link.href = "property.html?id=" + encodeURIComponent(property.id);
        link.textContent = "View property details →";

        content.append(heading, location, price);

        const type = document.createElement("p");
        type.className = "property-card-location";
        type.textContent = property.property_type;
        content.appendChild(type);

        if (features.children.length) {
            content.appendChild(features);
        }

        content.appendChild(link);

        card.append(imageWrapper, content);

        return card;

    }

    // -------------------------------------------------
    // RENDER PROPERTIES
    // -------------------------------------------------

    function renderProperties() {

        propertyGrid.innerHTML = "";

        properties.forEach(property => {
            propertyGrid.appendChild(createPropertyCard(property));
        });

        applyFilters();

    }

    // -------------------------------------------------
    // FILTER PROPERTIES
    // -------------------------------------------------

    function applyFilters() {

        const selectedArea = (areaInput?.value || "").toLowerCase();
        const selectedType = (typeInput?.value || "").toLowerCase();

        const minPrice = minPriceInput?.value
            ? Number(minPriceInput.value)
            : 0;

        const maxPrice = maxPriceInput?.value
            ? Number(maxPriceInput.value)
            : Infinity;

        const selectedBenefits = Array.from(
            filterForm.querySelectorAll('input[name="benefit"]:checked')
        ).map(input => input.value);

        const cards = Array.from(
            propertyGrid.querySelectorAll("[data-property-card]")
        );

        let visibleCount = 0;

        cards.forEach(card => {

            const area = card.dataset.area || "";
            const type = card.dataset.type || "";
            const price = Number(card.dataset.price || 0);

            const matchesArea = !selectedArea || area === selectedArea;

            const matchesType =
                !selectedType ||
                type === selectedType ||
                (selectedType === "flat / apartment" && type === "flat") ||
                (selectedType === "shared accommodation" && type === "shared accommodation");

            const matchesPrice =
                price >= minPrice && price <= maxPrice;

            const matchesBenefits = selectedBenefits.every(
                benefit => card.dataset[benefit] === "true"
            );

            const visible =
                matchesArea &&
                matchesType &&
                matchesPrice &&
                matchesBenefits;

            card.hidden = !visible;

            if (visible) visibleCount++;

        });

        if (resultsCount) {
            resultsCount.textContent =
                visibleCount + (
                    visibleCount === 1
                        ? " property found"
                        : " properties found"
                );
        }

        if (emptyState) {
            emptyState.hidden = visibleCount !== 0;
        }

    }

    // -------------------------------------------------
    // SORT
    // -------------------------------------------------

    function sortCards() {

        const sortValue = sortListings?.value || "newest";

        properties.sort((a, b) => {

            if (sortValue === "price-low") {
                return Number(a.monthly_rent) - Number(b.monthly_rent);
            }

            if (sortValue === "price-high") {
                return Number(b.monthly_rent) - Number(a.monthly_rent);
            }

            return new Date(b.created_at) - new Date(a.created_at);

        });

        renderProperties();

    }

    // -------------------------------------------------
    // HOMEPAGE SEARCH PARAMETERS
    // -------------------------------------------------

    const params = new URLSearchParams(window.location.search);

    if (areaInput && params.has("area")) {
        areaInput.value = params.get("area");
    }

    if (typeInput && params.has("type")) {
        typeInput.value = params.get("type");
    }

    if (maxPriceInput && params.has("budget")) {
        maxPriceInput.value = params.get("budget");
    }

    // -------------------------------------------------
    // EVENTS
    // -------------------------------------------------

    filterForm.addEventListener("submit", function (event) {
        event.preventDefault();
        applyFilters();
    });

    if (sortListings) {
        sortListings.addEventListener("change", sortCards);
    }

    if (resetButton) {

        resetButton.addEventListener("click", function () {

            filterForm.reset();

            const url = new URL(window.location.href);
            url.search = "";

            window.history.replaceState({}, "", url);

            if (sortListings) sortListings.value = "newest";

            applyFilters();

        });

    }

    // -------------------------------------------------
    // START
    // -------------------------------------------------

    await loadProperties();

});

