
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("Supabase environment variables are missing.");
    return jsonResponse({ error: "The submission service is unavailable." }, 500);
  }

  const adminDb = createClient(supabaseUrl, serviceKey);

  let applicationId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const form = await req.formData();

    // Honeypot: silently reject automated submissions.
    if (String(form.get("website") || "").trim()) {
      return jsonResponse({ success: true, message: "Submission received." });
    }

    const landlordName = getText(form, "landlord_name");
    const landlordPhone = getText(form, "landlord_phone");
    const landlordEmail = getText(form, "landlord_email");
    const contactMethod = getText(form, "contact_method");

    const propertyTitle = getText(form, "property_title");
    const propertyType = getText(form, "property_type");
    const selectedArea = getText(form, "property_area");
    const otherArea = getText(form, "other_area");
    const propertyAddress = getText(form, "property_address");
    const availability = getText(form, "availability");

    const monthlyRent = Number(form.get("monthly_rent"));
    const depositRaw = getText(form, "deposit");
    const bedroomsRaw = getText(form, "bedrooms");
    const unitsRaw = getText(form, "available_units");
    const description = getText(form, "property_description");

    const ownershipConfirmed = form.get("ownership_confirmation") === "on";
    const accuracyConfirmed = form.get("accuracy_confirmation") === "on";
    const privacyConsent = form.get("privacy_consent") === "on";

    if (
      !landlordName ||
      !landlordPhone ||
      !contactMethod ||
      !propertyTitle ||
      !propertyType ||
      !selectedArea ||
      !availability ||
      !description
    ) {
      return jsonResponse({ error: "Please complete all required fields." }, 400);
    }

    if (landlordName.length > 120 || landlordPhone.length > 30 ||
        propertyTitle.length > 100 || description.length > 1500) {
      return jsonResponse({ error: "One or more fields are too long." }, 400);
    }

    if (landlordEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(landlordEmail)) {
      return jsonResponse({ error: "Please provide a valid email address." }, 400);
    }

    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return jsonResponse({ error: "Please enter a valid monthly rental amount." }, 400);
    }

    if (depositRaw && (!Number.isFinite(Number(depositRaw)) || Number(depositRaw) < 0)) {
      return jsonResponse({ error: "Please enter a valid deposit amount." }, 400);
    }

    const bedrooms = bedroomsRaw === "5+" ? 5 : Number(bedroomsRaw);
    if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 5) {
      return jsonResponse({ error: "Please select a valid number of bedrooms." }, 400);
    }

    const availableUnits = unitsRaw ? Number(unitsRaw) : 1;
    if (!Number.isInteger(availableUnits) || availableUnits < 1 || availableUnits > 100) {
      return jsonResponse({ error: "Please enter a valid number of available units." }, 400);
    }

    if (!["Available now", "Available soon", "Coming soon"].includes(availability)) {
      return jsonResponse({ error: "Please select a valid availability option." }, 400);
    }

    if (!["Room", "Bachelor unit", "Flat / Apartment", "House",
          "Shared accommodation", "Student accommodation"].includes(propertyType)) {
      return jsonResponse({ error: "Please select a valid property type." }, 400);
    }

    if (!["WhatsApp", "Phone call", "Email"].includes(contactMethod)) {
      return jsonResponse({ error: "Please select a valid contact method." }, 400);
    }

    if (!ownershipConfirmed || !accuracyConfirmed || !privacyConsent) {
      return jsonResponse({ error: "Please accept all required confirmations." }, 400);
    }

    const areaName = selectedArea === "Other" ? otherArea : selectedArea;

    if (!areaName || areaName.length > 100) {
      return jsonResponse({ error: "Please provide a valid property area." }, 400);
    }

    // Only accept areas that an administrator has approved.
    const { data: area, error: areaError } = await adminDb
      .from("approved_areas")
      .select("id")
      .eq("name", areaName)
      .eq("is_active", true)
      .maybeSingle();

    if (areaError) throw areaError;

    if (!area) {
      return jsonResponse({
        error: "This area is not currently accepting listings. Please contact us for assistance.",
      }, 400);
    }

    const amenitiesSelected = form.getAll("amenities").map(String);

    const amenities = {
      furnished: amenitiesSelected.includes("Furnished"),
      unfurnished: amenitiesSelected.includes("Unfurnished"),
      water_included: amenitiesSelected.includes("Water included"),
      electricity_included: amenitiesSelected.includes("Electricity included"),
      wifi: amenitiesSelected.includes("Wi-Fi"),
      parking: amenitiesSelected.includes("Parking"),
      security: amenitiesSelected.includes("Security"),
      shared_kitchen: amenitiesSelected.includes("Shared kitchen"),
      private_bathroom: amenitiesSelected.includes("Private bathroom"),
      garden: amenitiesSelected.includes("Garden"),
    };

    const photos = form.getAll("property_images")
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (photos.length > MAX_FILES) {
      return jsonResponse({ error: "You can upload a maximum of five photos." }, 400);
    }

    for (const photo of photos) {
      if (photo.size > MAX_FILE_SIZE) {
        return jsonResponse({ error: "Each photo must be 5 MB or smaller." }, 400);
      }

      if (!ALLOWED_TYPES.includes(photo.type)) {
        return jsonResponse({ error: "Only JPG, PNG and WebP photos are accepted." }, 400);
      }
    }

    const preferredContactMethod =
      contactMethod === "Phone call" ? "Phone" : contactMethod;

    const { data: application, error: insertError } = await adminDb
      .from("landlord_applications")
      .insert({
        full_name: landlordName,
        phone: landlordPhone,
        email: landlordEmail || null,
        property_title: propertyTitle,
        property_address: propertyAddress || null,
        area_id: area.id,
        area_name: areaName,
        property_type: propertyType,
        availability,
        monthly_rent: monthlyRent,
        deposit_amount: depositRaw ? Number(depositRaw) : null,
        bedrooms,
        available_units: availableUnits,
        description,
        preferred_contact_method: preferredContactMethod,
        amenities,
        ownership_confirmed: ownershipConfirmed,
        accuracy_confirmed: accuracyConfirmed,
        privacy_consent: privacyConsent,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    applicationId = application.id;

    // Upload photos into the private application-photos bucket.
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath =
        `${applicationId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await adminDb.storage
        .from("application-photos")
        .upload(storagePath, photo, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      uploadedPaths.push(storagePath);

      const { error: photoRecordError } = await adminDb
        .from("application_photos")
        .insert({
          application_id: applicationId,
          storage_path: storagePath,
          original_filename: photo.name,
          file_size: photo.size,
          content_type: photo.type,
        });

      if (photoRecordError) throw photoRecordError;
    }

    return jsonResponse({
      success: true,
      message: "Your property application has been submitted successfully.",
    });

  } catch (error) {
    console.error("Property submission failed:", error);

    // Remove uploaded files and the incomplete application if something fails.
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await adminDb.storage
        .from("application-photos")
        .remove(uploadedPaths);

      if (cleanupError) console.error("Photo cleanup failed:", cleanupError);
    }

    if (applicationId) {
      const { error: deleteError } = await adminDb
        .from("landlord_applications")
        .delete()
        .eq("id", applicationId);

      if (deleteError) console.error("Application cleanup failed:", deleteError);
    }

    return jsonResponse({
      error: "We could not submit your application. Please try again.",
    }, 500);
  }
});

function getText(form: FormData, key: string): string {
  return String(form.get(key) || "").trim();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
