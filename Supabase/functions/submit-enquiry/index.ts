
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
    const respond = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
            },
        });

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return respond({ error: "Method not allowed." }, 405);
    }

    try {
        // 1. Read server-side Supabase configuration.
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY"
        );

        if (!supabaseUrl || !serviceRoleKey) {
            console.error("Missing Supabase server configuration:", {
                urlAvailable: Boolean(supabaseUrl),
                secretAvailable: Boolean(serviceRoleKey),
            });

            throw new Error("Server configuration is incomplete.");
        }

        // 2. Create privileged server-side client.
        const adminDb = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // 3. Read and validate request body.
        let body: Record<string, unknown>;

        try {
            body = await req.json();
        } catch {
            return respond({ error: "Invalid request body." }, 400);
        }

        const {
            property_id,
            tenant_name,
            tenant_phone,
            tenant_email,
            preferred_move_in,
            message,
            privacy_consent,
        } = body;

        if (
            typeof property_id !== "string" ||
            typeof tenant_name !== "string" ||
            typeof tenant_phone !== "string" ||
            privacy_consent !== true
        ) {
            return respond({
                error:
                    "Please complete the required fields and accept the privacy notice.",
            }, 400);
        }

        const propertyId = property_id.trim();
        const name = tenant_name.trim();
        const phone = tenant_phone.trim();

        const email =
            typeof tenant_email === "string"
                ? tenant_email.trim()
                : "";

        const enquiryMessage =
            typeof message === "string"
                ? message.trim()
                : "";

        // 4. Validate property ID.
        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidPattern.test(propertyId)) {
            return respond({
                error: "Invalid accommodation reference.",
            }, 400);
        }

        // 5. Validate tenant information.
        if (name.length < 2 || name.length > 120) {
            return respond({
                error: "Please enter a valid full name.",
            }, 400);
        }

        if (!/^[0-9+\s()-]{7,25}$/.test(phone)) {
            return respond({
                error: "Please enter a valid contact number.",
            }, 400);
        }

        if (
            email.length > 254 ||
            (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        ) {
            return respond({
                error: "Please enter a valid email address.",
            }, 400);
        }

        if (enquiryMessage.length > 2000) {
            return respond({
                error: "Your message is too long.",
            }, 400);
        }

        // 6. Validate preferred move-in date.
        let moveInDate: string | null = null;

        if (preferred_move_in) {
            if (
                typeof preferred_move_in !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(preferred_move_in)
            ) {
                return respond({
                    error: "Please enter a valid move-in date.",
                }, 400);
            }

            const parsedDate = new Date(
                `${preferred_move_in}T00:00:00Z`
            );

            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.toISOString().slice(0, 10) !==
                    preferred_move_in
            ) {
                return respond({
                    error: "Please enter a valid move-in date.",
                }, 400);
            }

            moveInDate = preferred_move_in;
        }

        // 7. Confirm that the property is approved and available.
        const { data: property, error: propertyError } =
            await adminDb
                .from("properties")
                .select("id")
                .eq("id", propertyId)
                .eq("status", "approved")
                .eq("available", true)
                .maybeSingle();

        if (propertyError) {
            console.error("Property lookup error:", propertyError);
            throw propertyError;
        }

        if (!property) {
            return respond({
                error:
                    "This accommodation is no longer available.",
            }, 404);
        }

        // 8. Save the tenant enquiry.
        const { data: enquiry, error: insertError } =
            await adminDb
                .from("enquiries")
                .insert({
                    property_id: property.id,
                    tenant_name: name,
                    tenant_phone: phone,
                    tenant_email: email || null,
                    preferred_move_in: moveInDate,
                    message: enquiryMessage || null,
                    status: "new",
                })
                .select("id")
                .single();

        if (insertError) {
            console.error("Enquiry insert error:", insertError);
            throw insertError;
        }

        // 9. Return success.
        return respond({
            success: true,
            message:
                "Your enquiry has been submitted successfully.",
            enquiry_id: enquiry.id,
        });

    } catch (error) {
        console.error("Submit enquiry error:", error);

        return respond({
            error:
                "We could not submit your enquiry. Please try again.",
        }, 500);
    }
});

