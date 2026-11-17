
document.addEventListener("DOMContentLoaded", () => {

    const properties = [
        {
            id: "KAC-DEMO-001",
            title: "Modern Bachelor Unit",
            location: "Mega City, Mmabatho",
            area: "mega city",
            type: "bachelor",
            price: 2500,
            features: ["Private bathroom", "Parking"],
            image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-002",
            title: "Student Accommodation Room",
            location: "Mmabatho",
            area: "mmabatho",
            type: "room",
            price: 1800,
            features: ["Shared facilities", "Student friendly"],
            image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-003",
            title: "Contemporary Apartment",
            location: "Golfview, Mahikeng",
            area: "golfview",
            type: "flat",
            price: 3500,
            features: ["Two bedrooms", "Parking"],
            image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-004",
            title: "Comfortable Rental Room",
            location: "Unit 7, Mmabatho",
            area: "unit 7",
            type: "room",
            price: 1500,
            features: ["Furnished", "Shared kitchen"],
            image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-005",
            title: "Private Bachelor Apartment",
            location: "Riviera Park",
            area: "riviera park",
            type: "bachelor",
            price: 2800,
            features: ["Private bathroom", "Kitchenette"],
            image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-006",
            title: "Family Rental House",
            location: "Montshiwa, Mahikeng",
            area: "montshiwa",
            type: "house",
            price: 5000,
            features: ["Three bedrooms", "Yard"],
            image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-007",
            title: "Neat Apartment",
            location: "Unit 8, Mmabatho",
            area: "unit 8",
            type: "flat",
            price: 3200,
            features: ["Two bedrooms", "Secure parking"],
            image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80"
        },
        {
            id: "KAC-DEMO-008",
            title: "Affordable Rental Room",
            location: "Lonely Park",
            area: "lonely park",
            type: "room",
            price: 1300,
            features: ["Shared bathroom", "Water included"],
            image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=80"
        }
    ];

    const grid = document.getElementById("directoryGrid");
    const locationFilter = document.getElementById("locationFilter");
    const typeFilter = document.getElementById("typeFilter");
    const budgetFilter = document.getElementById("budgetFilter");
    const sortFilter = document.getElementById("sortFilter");

    const resultsCount = document.getElementById("resultsCount");
    const filterDescription = document.getElementById("filterDescription");
    const emptyResults = document.getElementById("emptyResults");

    const applyButton = document.getElementById("applyFilters");
    const resetButton = document.getElementById("resetFilters");
    const emptyReset = document.getElementById("emptyReset");

    function formatPrice(price) {
        return "R" + price.toLocaleString("en-ZA");
    }

    function renderProperties(items) {

        grid.innerHTML = "";

        resultsCount.textContent =
            `${items.length} ${items.length === 1 ? "property" : "properties"}`;

        emptyResults.hidden = items.length !== 0;
        grid.hidden = items.length === 0;

        if (items.length === 0) {
            filterDescription.textContent = "No properties match your search";
            return;
        }

        filterDescription.textContent = "Showing demonstration listings";

        items.forEach(property => {

            const card = document.createElement("article");
            card.className = "directory-card";

            const image = document.createElement("img");
            image.src = property.image;
            image.alt = "Example accommodation interior";
            image.loading = "lazy";

            const imageContainer = document.createElement("div");
            imageContainer.className = "directory-card-image";

            const tag = document.createElement("span");
            tag.className = "demo-tag";
            tag.textContent = "Example listing";

            imageContainer.append(image, tag);

            const content = document.createElement("div");
            content.className = "directory-card-content";

            const location = document.createElement("p");
            location.className = "directory-card-location";
            location.textContent = property.location;

            const title = document.createElement("h3");
            title.textContent = property.title;

            const price = document.createElement("p");
            price.className = "directory-card-price";
            price.textContent = formatPrice(property.price);

            const monthly = document.createElement("small");
            monthly.textContent = " / month";
            price.appendChild(monthly);

            const features = document.createElement("div");
            features.className = "directory-card-features";

            property.features.forEach(feature => {
                const item = document.createElement("span");
                item.textContent = feature;
                features.appendChild(item);
            });

            const link = document.createElement("a");
            link.className = "directory-card-link";
            link.href = `property.html?id=${encodeURIComponent(property.id)}`;
            link.textContent = "View property";

            content.append(location, title, price, features, link);
            card.append(imageContainer, content);
            grid.appendChild(card);
        });
    }

    function applyFilters() {

        const selectedLocation = locationFilter.value.toLowerCase();
        const selectedType = typeFilter.value;
        const maximumBudget = Number(budgetFilter.value);
        const sort = sortFilter.value;

        let filtered = properties.filter(property => {

            const matchesLocation =
                !selectedLocation || property.area.includes(selectedLocation);

            const matchesType =
                !selectedType || property.type === selectedType;

            const matchesBudget =
                !maximumBudget || property.price <= maximumBudget;

            return matchesLocation && matchesType && matchesBudget;
        });

        if (sort === "low") {
            filtered.sort((a, b) => a.price - b.price);
        }

        if (sort === "high") {
            filtered.sort((a, b) => b.price - a.price);
        }

        renderProperties(filtered);
    }

    function resetFilters() {
        locationFilter.value = "";
        typeFilter.value = "";
        budgetFilter.value = "";
        sortFilter.value = "default";
        applyFilters();
    }

    applyButton.addEventListener("click", applyFilters);
    resetButton.addEventListener("click", resetFilters);
    emptyReset.addEventListener("click", resetFilters);
    sortFilter.addEventListener("change", applyFilters);

    // Allow homepage area links to open the directory with an area selected.
    const params = new URLSearchParams(window.location.search);
    const requestedArea = params.get("area");

    if (requestedArea) {
        const matchingOption = [...locationFilter.options].find(option =>
            option.value.toLowerCase() === requestedArea.toLowerCase()
        );

        if (matchingOption) {
            locationFilter.value = matchingOption.value;
        }
    }

    renderProperties(properties);
    if (requestedArea) applyFilters();

});
