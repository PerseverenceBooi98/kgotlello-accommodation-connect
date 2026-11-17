
/* =====================================================
   KGOTLELLO ACCOMMODATION CONNECT
   MAIN JAVASCRIPT
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    // MOBILE NAVIGATION

    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    if (menuToggle && mainNav) {

        menuToggle.addEventListener("click", function () {

            const isOpen = mainNav.classList.toggle("open");

            menuToggle.setAttribute("aria-expanded", isOpen);
            menuToggle.setAttribute(
                "aria-label",
                isOpen ? "Close navigation" : "Open navigation"
            );

        });

        mainNav.querySelectorAll("a").forEach(function (link) {

            link.addEventListener("click", function () {
                mainNav.classList.remove("open");
                menuToggle.setAttribute("aria-expanded", "false");
                menuToggle.setAttribute("aria-label", "Open navigation");
            });

        });

    }


    // HOMEPAGE SEARCH

    const homeSearch = document.getElementById("homeSearch");

    if (homeSearch) {

        homeSearch.addEventListener("submit", function (event) {

            event.preventDefault();

            const area = document.getElementById("searchArea").value;
            const type = document.getElementById("searchType").value;
            const budget = document.getElementById("searchBudget").value;

            const params = new URLSearchParams();

            if (area) params.set("area", area);
            if (type) params.set("type", type);
            if (budget) params.set("budget", budget);

            window.location.href =
                "accommodation.html?" + params.toString();

        });

    }


    // FOOTER YEAR

    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

});
