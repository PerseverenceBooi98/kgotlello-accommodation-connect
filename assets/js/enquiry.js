
document.addEventListener("DOMContentLoaded", initialiseEnquiryForm);

function initialiseEnquiryForm() {
    const form = document.getElementById("propertyEnquiryForm");

    if (!form) {
        console.error("Enquiry form not found.");
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    const notice = form.querySelector(".form-notice");

    if (!button || !window.db) {
        console.error("Submit button or Supabase client missing.");
        return;
    }

    if (form.dataset.enquiryInitialized === "true") return;

    const propertyId = new URLSearchParams(location.search).get("id");

    if (!propertyId) {
        button.disabled = true;
        button.textContent = "Property unavailable";
        return;
    }

    form.dataset.enquiryInitialized = "true";
    button.disabled = false;
    button.textContent = "Submit Enquiry";

    if (notice) {
        notice.textContent = "Complete the form below and we will get back to you.";
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (button.disabled) return;

        const enquiry = {
            property_id: propertyId,
            tenant_name: document.getElementById("tenantName").value.trim(),
            tenant_phone: document.getElementById("tenantPhone").value.trim(),
            tenant_email: document.getElementById("tenantEmail").value.trim() || null,
            preferred_move_in: document.getElementById("moveInDate").value || null,
            message: document.getElementById("tenantMessage").value.trim(),
            privacy_consent: document.getElementById("privacyConsent").checked
        };

        if (!enquiry.tenant_name || !enquiry.tenant_phone || !enquiry.privacy_consent) {
            if (notice) notice.textContent = "Please complete all required fields and accept the privacy notice.";
            return;
        }

        button.disabled = true;
        button.textContent = "Submitting...";

        if (notice) notice.textContent = "Submitting your enquiry. Please wait.";

        try {
            const { data, error } = await window.db.functions.invoke(
                "submit-enquiry",
                { body: enquiry }
            );

            if (error) throw error;

            if (!data?.success) {
                throw new Error(data?.message || "Your enquiry could not be submitted.");
            }

            form.reset();

            button.textContent = "Enquiry Submitted";

            if (notice) {
                notice.textContent = "Thank you! Your enquiry has been received successfully. We will contact you soon.";
            }

            console.log("Enquiry successfully submitted:", data);

        } catch (error) {
    console.error("ENQUIRY ERROR:", error);

    let detailedError = error.message || "Unknown error";

    if (error.context) {
        try {
            const response = await error.context.clone().json();
            console.error("EDGE FUNCTION RESPONSE:", response);

            detailedError = response.message || response.error || detailedError;
        } catch (e) {
            console.error("Could not read function response:", e);
        }
    }

    button.disabled = false;
    button.textContent = "Submit Enquiry";

    if (notice) {
        notice.textContent = "Enquiry failed: " + detailedError;
    }
}
    });

    console.log("Enquiry form successfully initialised.");
}


