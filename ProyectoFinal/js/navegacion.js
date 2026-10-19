
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const vistas = document.querySelectorAll(".view");

    const modulos = {
        inicio: "inicio",
        planificacion: "view-planificacion",
        fumadores: "view-fumadores",
        lectores: "view-lectores",
        barberos: "view-barberos",
        filosofos: "view-filosofos",
        productor: "view-productor"
    };

    function mostrarModulo(nombre, actualizarHash = true) {
        const idVista = modulos[nombre];

        if (!idVista) {
            nombre = "inicio";
        }

        const vistaObjetivo = document.getElementById(
            modulos[nombre]
        );

        if (!vistaObjetivo) {
            console.error("No se encontró el módulo:", nombre);
            return;
        }

        vistas.forEach((vista) => {
            const activa = vista === vistaObjetivo;

            vista.classList.toggle("active", activa);
            vista.hidden = !activa;
        });

        if (actualizarHash) {
            history.replaceState(null, "", "#" + nombre);
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    document.querySelectorAll("[data-module]").forEach((boton) => {
        boton.addEventListener("click", () => {
            mostrarModulo(boton.dataset.module);
        });
    });

    window.addEventListener("hashchange", () => {
        const nombre = window.location.hash.slice(1);
        mostrarModulo(nombre || "inicio", false);
    });

    const moduloInicial = window.location.hash.slice(1);

    mostrarModulo(
        modulos[moduloInicial] ? moduloInicial : "inicio",
        false
    );
});
