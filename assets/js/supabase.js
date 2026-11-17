
console.log("Kgotlello: supabase.js is executing");

// Supabase configuration
const SUPABASE_URL = "https://gqxfuyqodainfkaylvem.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8eelwdmsIZrVTA2JDh_Jlg_hDBO5aZC";

// Initialise client
const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// Connection test
window.testSupabaseConnection = async function () {

    console.log("Testing Supabase connection...");

    const { data, error } = await db
        .from("approved_areas")
        .select("id, name")
        .limit(1);

    if (error) {
        console.error("Supabase error:", error.message);
        return false;
    }

    console.log("Kgotlello Supabase connection successful!", data);

    return true;
};

// Make database client available to other scripts
window.db = db;

console.log("Kgotlello: Supabase client initialised");

