
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const ui = {
        status: $("rwStatus"),
        mode: $("rwMode"),
        speed: $("rwSpeed"),
        speedValue: $("rwSpeedValue"),
        start: $("rwStart"),
        step: $("rwStep"),
        pause: $("rwPause"),
        reset: $("rwReset"),
        stepCount: $("rwStepCount"),
        readCount: $("rwReadCount"),
        writeCount: $("rwWriteCount"),
        waitCount: $("rwWaitCount"),
        database: $("rwDatabase"),
        databaseStatus: $("rwDatabaseStatus"),
        activeReaders: $("rwActiveReaders"),
        activeWriter: $("rwActiveWriter"),
        actors: $("rwActors"),
        explanation: $("rwExplanation"),
        log: $("rwLog"),

        visualScene: $("rwVisualScene"),
        visualBadge: $("rwVisualBadge"),
        sceneValue: $("rwSceneValue"),
        readerSceneCount: $("rwReaderSceneCount"),
        writerSceneCount: $("rwWriterSceneCount"),
        readerFigures: $("rwReaderFigures"),
        writerFigures: $("rwWriterFigures"),
        connectionLabel: $("rwConnectionLabel"),
        queue: $("rwQueue")
    };

    const initialActors = [
        { id: "R1", type: "reader", duration: 2 },
        { id: "R2", type: "reader", duration: 2 },
        { id: "R3", type: "reader", duration: 2 },
        { id: "E1", type: "writer", duration: 3 },
        { id: "E2", type: "writer", duration: 3 }
    ];

    let actors = [];
    let queue = [];
    let timer = null;
    let running = false;
    let stepCount = 0;
    let readCount = 0;
    let writeCount = 0;
    let databaseValue = 0;
    let activeReaders = 0;
    let activeWriter = null;
    let initialized = false;

    function log(message) {
        const entry = document.createElement("p");
        entry.textContent = `[Paso ${stepCount}] ${message}`;

        ui.log.appendChild(entry);

        while (ui.log.children.length > 100) {
            ui.log.removeChild(ui.log.firstElementChild);
        }

        ui.log.scrollTop = ui.log.scrollHeight;
    }

    function setStatus(message, type = "") {
        ui.status.textContent = message;
        ui.status.className = "concurrency-status";

        if (type) {
            ui.status.classList.add(type);
        }
    }

    function findActor(id) {
        return actors.find((actor) => actor.id === id);
    }

    function enqueueReadyActors() {
        actors.forEach((actor) => {
            if (
                actor.state === "ready" &&
                !queue.includes(actor.id) &&
                activeWriter !== actor.id
            ) {
                actor.state = "waiting";
                queue.push(actor.id);

                log(`${actor.id} solicita acceso a la base de datos.`);
            }
        });
    }

    function grantReader(actor) {
        actor.state = "reading";
        actor.remaining = actor.duration;
        activeReaders++;

        log(
            `${actor.id} comienza a leer. Lectores activos: ${activeReaders}.`
        );
    }

    function grantWriter(actor) {
        if (activeReaders !== 0 || activeWriter !== null) {
            throw new Error(
                "Error de sincronización: el escritor no puede acceder."
            );
        }

        actor.state = "writing";
        actor.remaining = actor.duration;
        activeWriter = actor.id;

        log(`${actor.id} obtiene acceso exclusivo para escribir.`);
    }

    function dispatchProcesses() {
        if (activeWriter !== null) {
            return;
        }

        if (activeReaders > 0) {
            while (queue.length > 0) {
                const next = findActor(queue[0]);

                if (!next || next.type !== "reader") {
                    break;
                }

                queue.shift();
                grantReader(next);
            }

            return;
        }

        if (queue.length === 0) {
            return;
        }

        const first = findActor(queue[0]);

        if (!first) {
            queue.shift();
            return;
        }

        if (first.type === "writer") {
            queue.shift();
            grantWriter(first);
            return;
        }

        while (queue.length > 0) {
            const next = findActor(queue[0]);

            if (!next || next.type !== "reader") {
                break;
            }

            queue.shift();
            grantReader(next);
        }
    }

    function advanceProcesses() {
        actors.forEach((actor) => {
            if (
                actor.state !== "reading" &&
                actor.state !== "writing"
            ) {
                return;
            }

            actor.remaining--;

            if (actor.remaining > 0) {
                return;
            }

            if (actor.state === "reading") {
                activeReaders--;
                readCount++;

                log(`${actor.id} termina de leer.`);
            } else {
                databaseValue++;
                writeCount++;
                activeWriter = null;

                log(
                    `${actor.id} termina de escribir. Nuevo dato: ${databaseValue}.`
                );
            }

            actor.state = "ready";
            actor.remaining = 0;
        });
    }

    // Crea la figura visual de cada proceso.
    function createFigure(actor) {
        const stateNames = {
            ready: "Preparado",
            waiting: "Esperando",
            reading: "Leyendo",
            writing: "Escribiendo"
        };

        const figure = document.createElement("div");
        figure.className = `rw-figure ${actor.state}`;

        const person = document.createElement("div");
        person.className = "rw-person";

        const hair = document.createElement("div");
        hair.className = "rw-person-hair";

        const head = document.createElement("div");
        head.className = "rw-person-head";

        const eyes = document.createElement("span");
        eyes.className = "rw-person-eye";

        const body = document.createElement("div");
        body.className = "rw-person-body";

        head.appendChild(eyes);
        person.append(hair, head, body);

        const name = document.createElement("strong");
        name.textContent = actor.id;

        const state = document.createElement("small");
        state.textContent = stateNames[actor.state];

        if (actor.state === "reading" || actor.state === "writing") {
            state.textContent += ` · ${actor.remaining}`;
        }

        figure.append(person, name, state);

        figure.setAttribute(
            "aria-label",
            `${actor.id}: ${state.textContent}`
        );

        return figure;
    }

    // Dibuja por separado los lectores y los escritores.
    function renderFigures() {
        ui.readerFigures.replaceChildren();
        ui.writerFigures.replaceChildren();

        const readers = actors.filter((actor) => actor.type === "reader");
        const writers = actors.filter((actor) => actor.type === "writer");

        readers.forEach((actor) => {
            ui.readerFigures.appendChild(createFigure(actor));
        });

        writers.forEach((actor) => {
            ui.writerFigures.appendChild(createFigure(actor));
        });

        const activeReaderCount = readers.filter(
            (actor) => actor.state === "reading"
        ).length;

        const activeWriterCount = writers.filter(
            (actor) => actor.state === "writing"
        ).length;

        ui.readerSceneCount.textContent =
            `${activeReaderCount} activo${activeReaderCount === 1 ? "" : "s"}`;

        ui.writerSceneCount.textContent =
            `${activeWriterCount} activo${activeWriterCount === 1 ? "" : "s"}`;

        ui.visualScene.classList.toggle(
            "readers-active",
            activeReaderCount > 0
        );

        ui.visualScene.classList.toggle(
            "writer-active",
            activeWriterCount > 0
        );

        if (activeWriterCount > 0) {
            ui.visualBadge.textContent = "Escritura exclusiva";
            ui.connectionLabel.textContent = "Escritor modificando datos";
        } else if (activeReaderCount > 0) {
            ui.visualBadge.textContent = "Lectura compartida";
            ui.connectionLabel.textContent = "Lectores consultando datos";
        } else if (queue.length > 0) {
            ui.visualBadge.textContent = "Procesos en espera";
            ui.connectionLabel.textContent = "Acceso pendiente";
        } else {
            ui.visualBadge.textContent = "Disponible";
            ui.connectionLabel.textContent = "Recurso disponible";
        }

        ui.sceneValue.textContent = `Dato almacenado: ${databaseValue}`;
    }

    // Representa los procesos que todavía esperan acceso.
    function renderQueue() {
        ui.queue.replaceChildren();

        if (queue.length === 0) {
            const empty = document.createElement("p");
            empty.className = "rw-queue-empty";
            empty.textContent = "No hay procesos esperando.";
            ui.queue.appendChild(empty);
            return;
        }

        queue.forEach((id, index) => {
            const actor = findActor(id);

            if (!actor) {
                return;
            }

            const item = document.createElement("div");
            item.className = "rw-queue-item";

            if (actor.type === "writer") {
                item.classList.add("writer");
            }

            item.textContent = `${index + 1}. ${actor.id}`;
            ui.queue.appendChild(item);
        });
    }

    function renderActors() {
        ui.actors.replaceChildren();

        actors.forEach((actor) => {
            const card = document.createElement("div");
            card.className = "reader-actor";

            if (actor.state === "reading" || actor.state === "writing") {
                card.classList.add("active");
            } else if (actor.state === "waiting") {
                card.classList.add("waiting");
            }

            const name = document.createElement("strong");
            name.textContent = actor.id;

            const state = document.createElement("span");

            const stateNames = {
                ready: "Preparado",
                waiting: "Esperando",
                reading: "Leyendo",
                writing: "Escribiendo"
            };

            state.textContent = stateNames[actor.state];

            card.append(name, state);
            ui.actors.appendChild(card);
        });
    }

    function render() {
        ui.stepCount.textContent = stepCount;
        ui.readCount.textContent = readCount;
        ui.writeCount.textContent = writeCount;
        ui.waitCount.textContent = queue.length;

        ui.database.textContent = `Dato actual: ${databaseValue}`;
        ui.activeReaders.textContent = activeReaders;
        ui.activeWriter.textContent = activeWriter || "Ninguno";

        if (activeWriter !== null) {
            ui.databaseStatus.textContent = "Escritura exclusiva en curso";
            ui.explanation.textContent =
                "Un escritor está modificando la base de datos. Ningún lector ni otro escritor puede acceder simultáneamente.";
        } else if (activeReaders > 0) {
            ui.databaseStatus.textContent = "Lectura compartida";
            ui.explanation.textContent =
                "Los lectores activos consultan la base de datos simultáneamente. Los escritores deben esperar a que terminen.";
        } else if (queue.length > 0) {
            ui.databaseStatus.textContent = "Procesos esperando";
            ui.explanation.textContent =
                "La base de datos está libre de operaciones activas. Se revisará la cola para conceder el acceso al siguiente proceso.";
        } else {
            ui.databaseStatus.textContent = "Disponible";
            ui.explanation.textContent =
                "La base de datos está disponible y no tiene procesos en ejecución.";
        }

        renderActors();
        renderFigures();
        renderQueue();
    }

    function stepSimulation() {
        if (!initialized) {
            initializeSimulation();
        }

        stepCount++;

        enqueueReadyActors();
        dispatchProcesses();
        advanceProcesses();
        render();

        setStatus("Simulación ejecutándose correctamente.");
    }

    function initializeSimulation() {
        stopTimer();

        actors = initialActors.map((actor) => ({
            ...actor,
            state: "ready",
            remaining: 0
        }));

        queue = [];
        running = false;
        stepCount = 0;
        readCount = 0;
        writeCount = 0;
        databaseValue = 0;
        activeReaders = 0;
        activeWriter = null;
        initialized = true;

        ui.log.replaceChildren();

        log("Simulación reiniciada.");
        log("La base de datos comienza con el valor 0.");

        render();
        setStatus("Simulación preparada. Pulsa Iniciar o Siguiente paso.");
        updateButtons();
    }

    function stopTimer() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startSimulation() {
        if (!initialized) {
            initializeSimulation();
        }

        if (running) {
            return;
        }

        running = true;
        setStatus("Simulación en ejecución.");

        if (ui.mode.value === "auto") {
            startTimer();
        }

        updateButtons();
    }

    function startTimer() {
        stopTimer();

        if (!running || ui.mode.value !== "auto") {
            return;
        }

        timer = setInterval(() => {
            if (running) {
                stepSimulation();
            }
        }, Number(ui.speed.value));
    }

    function pauseSimulation() {
        running = false;
        stopTimer();

        setStatus("Simulación pausada.");
        updateButtons();
    }

    function updateButtons() {
        ui.start.textContent = running ? "En ejecución" : "Iniciar";
        ui.start.disabled = running;
        ui.pause.disabled = !running;
    }

    ui.start.addEventListener("click", startSimulation);

    ui.step.addEventListener("click", () => {
        if (running) {
            pauseSimulation();
        }

        stepSimulation();
    });

    ui.pause.addEventListener("click", pauseSimulation);

    ui.reset.addEventListener("click", initializeSimulation);

    ui.speed.addEventListener("input", () => {
        ui.speedValue.textContent = `${ui.speed.value} ms por paso`;

        if (running && ui.mode.value === "auto") {
            startTimer();
        }
    });

    ui.mode.addEventListener("change", () => {
        if (!running) {
            return;
        }

        if (ui.mode.value === "auto") {
            startTimer();
        } else {
            stopTimer();
        }

        setStatus(
            ui.mode.value === "auto"
                ? "Modo automático activado."
                : "Modo paso a paso activado."
        );
    });

    initializeSimulation();
});
