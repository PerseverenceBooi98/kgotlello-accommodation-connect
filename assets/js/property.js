
/* =====================================================
   KGOTLELLO ACCOMMODATION CONNECT
   PROPERTY DETAILS + TENANT ENQUIRIES
   Live Supabase integration
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const $ = id => document.getElementById(id);

    const yearElement = $("currentYear");
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    const params = new URLSearchParams(window.location.search);
    const propertyId = params.get("id");

    const unavailable = $("propertyUnavailable");
    const content = $("propertyContent");

    const facilityLabels = {
        furnished: "Furnished",
        parking: "Parking",
        water_included: "Water included",
        electricity_included: "Electricity included",
        wifi: "Wi-Fi included",
        private_bathroom: "Private bathroom"
    };

    function showUnavailable() {
        if (unavailable) unavailable.hidden = false;
        if (content) content.hidden = true;
    }

    function showProperty() {
        if (unavailable) unavailable.hidden = true;
        if (content) content.hidden = false;
    }

    function money(value) {
        return value === null || value === undefined
            ? "Price not provided"
            : "R" + Number(value).toLocaleString("en-ZA");
    }

    // =================================================
    // PROPERTY GALLERY
    // =================================================

    function renderGallery(photos) {

        const main = $("galleryMain");
        const second = $("gallerySecond");
        const third = $("galleryThird");

        if (!main || !second || !third) return;

        main.innerHTML = "";
        second.innerHTML = "";
        third.innerHTML = "";

        const containers = [main, second, third];

        if (!photos || !photos.length) {
            main.textContent = "No photographs available.";
            return;
        }

        photos.slice(0, 3).forEach((photo, index) => {

            const { data } = window.db.storage
                .from("property-images")
                .getPublicUrl(photo.storage_path);

            if (!data?.publicUrl) return;

            const image = document.createElement("img");

            image.src = data.publicUrl;
            image.alt = "Accommodation photograph";
            image.loading = index === 0 ? "eager" : "lazy";

            containers[index].appendChild(image);
        });

        if (!main.children.length) {
            main.textContent = "Photographs unavailable.";
        }
    }

    // =================================================
    // PROPERTY FACILITIES
    // =================================================

    function renderFacilities(property) {

        const container = $("propertyFeatures");
        if (!container) return;

        container.innerHTML = "";

        const selected = Object.entries(facilityLabels)
            .filter(([key]) => property[key] === true)
            .map(([, label]) => label);

        if (!selected.length) {
            container.textContent =
                "No facilities information provided.";
            return;
        }

        selected.forEach(label => {
            const item = document.createElement("span");
            item.textContent = label;
            container.appendChild(item);
        });
    }

    // =================================================
    // TENANT ENQUIRY FORM
    // =================================================

    function setupEnquiryForm(property) {

        const form = $("propertyEnquiryForm");

        if (!form) {
            console.error("Enquiry form not found.");
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        const notice = form.querySelector(".form-notice");

        if (!submitButton || !notice) {
            console.error("Enquiry form elements are missing.");
            return;
        }

        // Prevent duplicate event registration.
        if (form.dataset.enquiryInitialized === "true") {
            return;
        }

        form.dataset.enquiryInitialized = "true";

        // Enable the button only for a verified property.
        submitButton.disabled = false;
        submitButton.textContent = "Submit Enquiry";

        notice.textContent =
            "Your enquiry will be sent securely to Kgotlello Accommodation Connect.";

        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");

        console.log("ENQUIRY FORM ACTIVATED:", property.id);

        // Register the actual submission handler.
        form.addEventListener("submit", async function (event) {

            event.preventDefault();

            if (!form.reportValidity()) return;

            const tenantName = $("tenantName")?.value.trim() || "";
            const tenantPhone = $("tenantPhone")?.value.trim() || "";
            const tenantEmail = $("tenantEmail")?.value.trim() || "";
            const moveInDate = $("moveInDate")?.value || "";
            const tenantMessage = $("tenantMessage")?.value.trim() || "";
            const privacyConsent = $("privacyConsent")?.checked || false;

            if (!tenantName || !tenantPhone) {
                notice.textContent =
                    "Please provide your full name and contact number.";
                return;
            }

            if (!privacyConsent) {
                notice.textContent =
                    "Please accept the privacy notice before submitting.";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";

            notice.textContent =
                "Please wait while we submit your enquiry.";

            try {

                if (!window.db) {
                    throw new Error(
                        "Database connection unavailable. Please try again later."
                    );
                }

                const { data, error } = await window.db.functions.invoke(
                    "submit-enquiry",
                    {
                        body: {
                            property_id: property.id,
                            tenant_name: tenantName,
                            tenant_phone: tenantPhone,
                            tenant_email: tenantEmail || null,
                            preferred_move_in: moveInDate || null,
                            message: tenantMessage,
                            privacy_consent: privacyConsent
                        }
                    }
                );

                if (error) {

                    let serverMessage = "";

                    try {
                        if (
                            error.context &&
                            typeof error.context.json === "function"
                        ) {
                            const errorBody = await error.context.json();
                            serverMessage = errorBody.error || "";
                        }
                    } catch (_) {
                        // Keep the standard error message.
                    }

                    throw new Error(
                        serverMessage ||
                        error.message ||
                        "We could not submit your enquiry. Please try again."
                    );
                }

                if (!data || !data.success) {
                    throw new Error(
                        data?.error ||
                        "Your enquiry could not be submitted."
                    );
                }

                form.reset();

                notice.textContent =
                    "Thank you! Your enquiry has been submitted successfully. Our team will contact you.";

                submitButton.textContent = "Enquiry Submitted";

                console.log(
                    "ENQUIRY SUCCESS:",
                    data.enquiry_id
                );

            } catch (error) {

                console.error("ENQUIRY ERROR:", error);

                notice.textContent =
                    error.message ||
                    "Something went wrong. Please try again.";

                submitButton.disabled = false;
                submitButton.textContent = "Submit Enquiry";
            }
        });
    }

    // =================================================
    // LOAD PROPERTY
    // =================================================

    async function loadProperty() {

        try {

            if (!window.db) {
                throw new Error("Supabase connection unavailable.");
            }

            if (!propertyId) {
                showUnavailable();
                return;
            }

            const { data: property, error } = await window.db
                .from("properties")
                .select(`
                    id,
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
                .eq("id", propertyId)
                .eq("status", "approved")
                .eq("available", true)
                .maybeSingle();

            if (error) throw error;

            if (!property) {
                showUnavailable();
                return;
            }

            // Populate property information.
            $("propertyReference").textContent =
                "Property reference: " +
                property.id.substring(0, 8).toUpperCase();

            $("propertyTitle").textContent =
                property.title || "Accommodation";

            const area = property.approved_areas?.name || "";

            $("propertyLocation").textContent = [
                area,
                property.property_address
            ].filter(Boolean).join(" · ") || "Mahikeng";

            $("propertyPrice").textContent =
                money(property.monthly_rent);

            $("propertyDescription").textContent =
                property.description ||
                "No property description provided.";

            $("propertyType").textContent =
                property.property_type || "Not specified";

            $("propertyBedrooms").textContent = "Not specified";
            $("propertyBathrooms").textContent = "Not specified";

            $("propertyAvailability").textContent =
                property.available ? "Available" : "Unavailable";

            renderFacilities(property);

            $("propertyNotes").textContent =
                "Please contact Kgotlello Accommodation Connect to confirm current availability, rental terms and any additional costs.";

            // Load property photographs.
            const { data: photos, error: photoError } = await window.db
                .from("property_photos")
                .select("storage_path, is_cover, display_order")
                .eq("property_id", property.id)
                .order("display_order", { ascending: true });

            if (photoError) {

                console.error("Property photo loading error:", photoError);
                renderGallery([]);

            } else {

                const sortedPhotos = photos || [];

                sortedPhotos.sort((a, b) => {

                    if (a.is_cover !== b.is_cover) {
                        return a.is_cover ? -1 : 1;
                    }

                    return a.display_order - b.display_order;
                });

                renderGallery(sortedPhotos);
            }

            // Show verified property.
            showProperty();

            // Activate the enquiry form.
            setupEnquiryForm(property);

       // } catch (error) {

//            console.error("Property loading error:", error);
  //          showUnavailable();
    //    }
    }

    // =================================================
    // START PAGE
    // =================================================

    showUnavailable();

    await loadProperty();

}

// Start the page whether the DOM is still loading or already ready.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPropertyPage, {
        once: true
    });
} else {
    initPropertyPage();
}
