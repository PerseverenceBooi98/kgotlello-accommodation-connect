
// =====================================================
// KGOTLELLO ACCOMMODATION CONNECT
// APPROVE LANDLORD APPLICATION
// Creates a property listing and publishes its photos
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminDb = createClient(supabaseUrl, serviceRoleKey);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function mapPropertyType(value: string): string {
  const type = normalise(value);

  if (type.includes("bachelor")) return "Bachelor";
  if (type.includes("flat") || type.includes("apartment")) return "Flat";
  if (type.includes("shared")) return "Shared Accommodation";
  if (type.includes("house")) return "House";
  if (type.includes("room")) return "Room";

  return "Other";
}

function getFacilities(amenities: unknown) {
  const values = Array.isArray(amenities)
    ? amenities.map(normalise)
    : [];

  return {
    furnished: values.includes("furnished"),
    parking: values.includes("parking"),
    water_included: values.includes("water included"),
    electricity_included: values.includes("electricity included"),
    wifi: values.includes("wi-fi") || values.includes("wifi"),
    private_bathroom: values.includes("private bathroom"),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return response({ error: "Authentication required." }, 401);
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // 1. Verify administrator session.
    const { data: userData, error: userError } =
      await adminDb.auth.getUser(token);

    if (userError || !userData.user) {
      return response({ error: "Invalid administrator session." }, 401);
    }

    // 2. Confirm administrator access.
    const { data: admin, error: adminError } = await adminDb
      .from("admin_users")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (adminError || !admin) {
      return response({ error: "Administrator access denied." }, 403);
    }

    // 3. Validate application ID.
    const body = await req.json();
    const applicationId = String(body.application_id ?? "").trim();

    if (!applicationId) {
      return response({ error: "Application ID is required." }, 400);
    }

    const { data: application, error: applicationError } = await adminDb
      .from("landlord_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      return response({ error: "Landlord application not found." }, 404);
    }

    // 4. Prevent duplicate property creation.
    const { data: existingProperty, error: existingError } = await adminDb
      .from("properties")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingProperty) {
      return response({
        success: true,
        already_approved: true,
        property_id: existingProperty.id,
        message: "This application already has a property listing.",
      });
    }

    if (!["pending", "under_review"].includes(application.status)) {
      return response({
        error: `This application cannot be approved from its current status: ${application.status}.`,
      }, 409);
    }

    // 5. Match the submitted area to an active approved area.
    let areaQuery = adminDb
      .from("approved_areas")
      .select("id, name")
      .eq("is_active", true);

    if (application.area_id) {
      areaQuery = areaQuery.eq("id", application.area_id);
    } else {
      areaQuery = areaQuery.ilike(
        "name",
        String(application.area_name ?? "").trim()
      );
    }

    const { data: area, error: areaError } =
      await areaQuery.maybeSingle();

    if (areaError || !area) {
      return response({
        error: "The property's area is not currently approved. Please check the approved areas.",
      }, 400);
    }

    // 6. Create the property listing.
    const { data: property, error: propertyError } = await adminDb
      .from("properties")
      .insert({
        application_id: applicationId,
        title: application.property_title || "Accommodation listing",
        description: application.description || "",
        area_id: area.id,
        property_address: application.property_address || null,
        property_type: mapPropertyType(application.property_type),
        monthly_rent: Number(application.monthly_rent),
        ...getFacilities(application.amenities),
        available: true,
        status: "approved",
      })
      .select("id")
      .single();

    if (propertyError || !property) {
      throw propertyError ?? new Error("Could not create property listing.");
    }

    const uploadedPaths: string[] = [];

    try {
      // 7. Retrieve uploaded application photos.
      const { data: applicationPhotos, error: photosError } =
        await adminDb
          .from("application_photos")
          .select("*")
          .eq("application_id", applicationId);

      if (photosError) throw photosError;

      const publishedPhotos: {
        property_id: string;
        storage_path: string;
        is_cover: boolean;
        display_order: number;
      }[] = [];

      // 8. Copy private photos into the public property-images bucket.
      for (
        let index = 0;
        index < (applicationPhotos ?? []).length;
        index++
      ) {
        const photo = applicationPhotos![index];

        const { data: file, error: downloadError } =
          await adminDb.storage
            .from("application-photos")
            .download(photo.storage_path);

        if (downloadError || !file) {
          throw downloadError ??
            new Error("Could not download an application photo.");
        }

        const extension =
          photo.content_type === "image/png"
            ? "png"
            : photo.content_type === "image/webp"
              ? "webp"
              : "jpg";

        const publicPath =
          `${property.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await adminDb.storage
          .from("property-images")
          .upload(publicPath, file, {
            contentType: photo.content_type || "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        uploadedPaths.push(publicPath);

        publishedPhotos.push({
          property_id: property.id,
          storage_path: publicPath,
          is_cover: index === 0,
          display_order: index,
        });
      }

      // 9. Save photo records in the CORRECT database table.
      if (publishedPhotos.length > 0) {
        const { error: insertPhotosError } = await adminDb
          .from("property_photos")
          .insert(publishedPhotos);

        if (insertPhotosError) throw insertPhotosError;
      }

      // 10. Mark the landlord application as approved.
      const { error: updateApplicationError } = await adminDb
        .from("landlord_applications")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", applicationId);

      if (updateApplicationError) throw updateApplicationError;

      return response({
        success: true,
        property_id: property.id,
        photos_published: publishedPhotos.length,
        message: "Application approved and property listing created successfully.",
      });

    } catch (processingError) {
      // 11. Roll back incomplete publishing.
      await adminDb
        .from("property_photos")
        .delete()
        .eq("property_id", property.id);

      if (uploadedPaths.length > 0) {
        await adminDb.storage
          .from("property-images")
          .remove(uploadedPaths);
      }

      await adminDb
        .from("properties")
        .delete()
        .eq("id", property.id);

      throw processingError;
    }

  } catch (error) {
    console.error("Approve property error:", error);

    return response({
      error: "The application could not be approved. Please check the function logs.",
    }, 500);
  }
});
