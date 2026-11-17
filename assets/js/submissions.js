
/* =====================================================
   KGOTLELLO - PROPERTY SUBMISSION
   Front-end validation + Supabase submission
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    const form = document.getElementById("propertySubmissionForm");
    const areaSelect = document.getElementById("propertyArea");
    const otherAreaGroup = document.getElementById("otherAreaGroup");
    const otherAreaInput = document.getElementById("otherArea");
    const imageInput = document.getElementById("propertyImages");
    const imagePreview = document.getElementById("imagePreview");
    const message = document.getElementById("submissionMessage");

    if (!form) return;


    /* =====================================================
       AREA SELECTION
    ===================================================== */

    if (areaSelect) {

        areaSelect.addEventListener("change", function () {

            const isOther = this.value === "Other";

            if (otherAreaGroup) {
                otherAreaGroup.hidden = !isOther;
            }

            if (otherAreaInput) {
                otherAreaInput.required = isOther;

                if (!isOther) {
                    otherAreaInput.value = "";
                }
            }
        });
    }


    /* =====================================================
       PHOTO SELECTION AND PREVIEWS
    ===================================================== */

    if (imageInput) {

        imageInput.addEventListener("change", function () {

            if (imagePreview) {
                imagePreview.innerHTML = "";
            }

            const files = Array.from(this.files);

            if (files.length > 5) {
                showMessage(
                    "Please select a maximum of five photographs.",
                    "error"
                );

                this.value = "";
                return;
            }

            for (const file of files) {

                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {

                    showMessage(
                        "Please use JPG, PNG or WebP photographs only.",
                        "error"
                    );

                    this.value = "";

                    if (imagePreview) {
                        imagePreview.innerHTML = "";
                    }

                    return;
                }

                if (file.size > 5 * 1024 * 1024) {

                    showMessage(
                        "Each photograph must be 5 MB or smaller.",
                        "error"
                    );

                    this.value = "";

                    if (imagePreview) {
                        imagePreview.innerHTML = "";
                    }

                    return;
                }
            }

            files.forEach(function (file) {

                const reader = new FileReader();

                reader.onload = function (event) {

                    if (!imagePreview) return;

                    const item = document.createElement("div");
                    item.className = "preview-item";

                    const image = document.createElement("img");
                    image.src = event.target.result;
                    image.alt = "Selected property photograph";

                    const label = document.createElement("span");
                    label.textContent = "Preview";

                    item.appendChild(image);
                    item.appendChild(label);

                    imagePreview.appendChild(item);
                };

                reader.readAsDataURL(file);
            });

            if (message) {
                message.hidden = true;
            }
        });
    }


    /* =====================================================
       FORM SUBMISSION
    ===================================================== */

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Confirm Supabase configuration is available.
        if (
            !window.db ||
            typeof SUPABASE_URL === "undefined" ||
            typeof SUPABASE_ANON_KEY === "undefined"
        ) {
            showMessage(
                "The submission service is not available. Please refresh the page and try again.",
                "error"
            );

            return;
        }

        const rentInput = document.getElementById("monthlyRent");
        const depositInput = document.getElementById("deposit");

        if (!rentInput || !depositInput) {
            showMessage(
                "Some form fields are missing. Please refresh the page.",
                "error"
            );
            return;
        }

        const rent = Number(rentInput.value);

        const deposit = depositInput.value === ""
            ? 0
            : Number(depositInput.value);

        if (!Number.isFinite(rent) || rent <= 0) {
            showMessage(
                "Please enter a valid monthly rental amount.",
                "error"
            );
            return;
        }

        if (!Number.isFinite(deposit) || deposit < 0) {
            showMessage(
                "The deposit cannot be negative.",
                "error"
            );
            return;
        }

        // Find the submit button.
        const submitButton = form.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        const originalButtonText = submitButton
            ? (
                submitButton.tagName === "INPUT"
                    ? submitButton.value
                    : submitButton.textContent
            )
            : "";

        try {

            // Prevent duplicate submissions.
            if (submitButton) {
                submitButton.disabled = true;

                if (submitButton.tagName === "INPUT") {
                    submitButton.value = "Submitting...";
                } else {
                    submitButton.textContent = "Submitting...";
                }
            }

            showMessage(
                "Submitting your property application. Please wait...",
                "info"
            );

            // Collect all fields, checkboxes and photographs.
            const formData = new FormData(form);

            // Submit directly to the Supabase Edge Function.
            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/submit-property`,
                {
                    method: "POST",
                    headers: {
                        apikey: SUPABASE_ANON_KEY
                    },
                    body: formData
                }
            );

            // Read the server response.
            let data;

            try {
                data = await response.json();
            } catch (parseError) {
                throw new Error(
                    "The server returned an unexpected response. Please try again."
                );
            }

            // Handle server-side errors.
            if (!response.ok || !data || data.success !== true) {
                throw new Error(
                    data?.error ||
                    "We could not submit your application. Please try again."
                );
            }

            // Submission successful.
            form.reset();

            if (imagePreview) {
                imagePreview.innerHTML = "";
            }

            if (otherAreaGroup) {
                otherAreaGroup.hidden = true;
            }

            if (otherAreaInput) {
                otherAreaInput.required = false;
            }

            showMessage(
                "Thank you! Your property application has been submitted successfully. Our team will review the information before the property can appear on the website.",
                "success"
            );

        } catch (error) {

            console.error("Kgotlello submission error:", error);

            showMessage(
                error.message ||
                "Something went wrong. Please try again.",
                "error"
            );

        } finally {

            // Restore the submit button.
            if (submitButton) {

                submitButton.disabled = false;

                if (submitButton.tagName === "INPUT") {
                    submitButton.value = originalButtonText;
                } else {
                    submitButton.textContent = originalButtonText;
                }
            }
        }

    });


    /* =====================================================
       MESSAGE DISPLAY
    ===================================================== */

    function showMessage(text, type) {

        if (!message) return;

        message.textContent = text;
        message.className = "submission-message " + type;
        message.hidden = false;

        message.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }

});
