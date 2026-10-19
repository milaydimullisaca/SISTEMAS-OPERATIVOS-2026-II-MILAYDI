/* js/filosofos.js */

(() => {
    const $ = (id) => document.getElementById(id);

    const ui = {
        app: $("philosophersApp"),
        status: $("phStatus"),
        mode: $("phMode"),
        speed: $("phSpeed"),
        speedValue: $("phSpeedValue"),
        start: $("phStart"),
        step: $("phStep"),
        pause: $("phPause"),
        reset: $("phReset"),
        steps: $("phSteps"),
        meals: $("phMeals"),
        eating: $("phEating"),
        waiting: $("phWaiting"),
        table: $("phTable"),
        tableInfo: $("phTableInfo"),
        forks: $("phForks"),
        actors: $("phActors"),
        explanation: $("phExplanation"),
        log: $("phLog")
    };

    if (!ui.app || !ui.table) return;

    const TOTAL = 5;

    const appearances = [
        { skin: "#d7a17c", hair: "#49352b", shirt: "#426a9b" },
        { skin: "#edc09c", hair: "#30251f", shirt: "#8b536c" },
        { skin: "#b97953", hair: "#252321", shirt: "#467c70" },
        { skin: "#f0c7a4", hair: "#76513a", shirt: "#a87935" },
        { skin: "#c88d67", hair: "#382923", shirt: "#6a6097" }
    ];

    let philosophers = [];
    let forks = [];
    let running = false;
    let timer = null;
    let stepCount = 0;
    let totalMeals = 0;
    let logEntries = [];

    function initialState() {
        philosophers = Array.from({ length: TOTAL }, (_, i) => ({
            id: i,
            name: `Filósofo ${i + 1}`,
            state: "thinking",
            remaining: 2,
            meals: 0,
            leftFork: i,
            rightFork: (i + 1) % TOTAL,
            heldForks: [],
            waitTime: 0
        }));

        forks = Array.from({ length: TOTAL }, (_, i) => ({
            id: i,
            owner: null
        }));

        stepCount = 0;
        totalMeals = 0;
        logEntries = [];

        addLog("La simulación está lista. Todos los filósofos comienzan pensando.");
        render();
    }

    function addLog(message, type = "") {
        const time = String(stepCount).padStart(3, "0");

        logEntries.unshift({
            time,
            message,
            type
        });

        logEntries = logEntries.slice(0, 35);
        renderLog();
    }

    function stateName(state) {
        const names = {
            thinking: "Pensando",
            hungry: "Esperando tenedores",
            eating: "Comiendo"
        };

        return names[state] || state;
    }

    function canEat(p) {
        return forks[p.leftFork].owner === null &&
            forks[p.rightFork].owner === null;
    }

    function acquireForks(p) {
        if (!canEat(p)) return false;

        /*
         * Se adquieren ambos tenedores como una sola operación
         * lógica para evitar que dos filósofos compartan uno.
         */
        forks[p.leftFork].owner = p.id;
        forks[p.rightFork].owner = p.id;
        p.heldForks = [p.leftFork, p.rightFork];

        p.state = "eating";
        p.remaining = 3;

        addLog(
            `${p.name} tomó los tenedores ${p.leftFork + 1} y ${p.rightFork + 1} y comenzó a comer.`,
            "eating"
        );

        return true;
    }

    function releaseForks(p) {
        p.heldForks.forEach((forkId) => {
            if (forks[forkId].owner === p.id) {
                forks[forkId].owner = null;
            }
        });

        p.heldForks = [];
    }

    function requestToEat(p) {
        if (p.state !== "hungry") return;

        if (canEat(p)) {
            acquireForks(p);
        } else {
            p.waitTime++;
        }
    }

    function advanceSimulation() {
        stepCount++;

        /*
         * Primero avanzan los filósofos que ya están comiendo
         * o pensando. Después se revisan las solicitudes pendientes.
         */
        philosophers.forEach((p) => {
            if (p.state === "thinking") {
                p.remaining--;

                if (p.remaining <= 0) {
                    p.state = "hungry";
                    p.remaining = 0;
                    p.waitTime = 0;

                    addLog(
                        `${p.name} tiene hambre y solicita sus dos tenedores.`,
                        "hungry"
                    );
                }
            } else if (p.state === "eating") {
                p.remaining--;

                if (p.remaining <= 0) {
                    releaseForks(p);

                    p.meals++;
                    totalMeals++;

                    p.state = "thinking";
                    p.remaining = 2;

                    addLog(
                        `${p.name} terminó de comer y dejó libres sus tenedores. Total de comidas: ${p.meals}.`,
                        "eating"
                    );
                }
            } else if (p.state === "hungry") {
                p.waitTime++;
            }
        });

        /*
         * Los filósofos hambrientos solicitan ambos tenedores.
         * La operación es atómica en esta simulación: no se reserva
         * un solo tenedor mientras esperan por el otro.
         */
        const hungry = philosophers
            .filter((p) => p.state === "hungry")
            .sort((a, b) => a.waitTime - b.waitTime || a.id - b.id);

        hungry.forEach((p) => requestToEat(p));

        render();
    }

    function getPosition(index, radiusX, radiusY) {
        const angle = (-90 + index * 72) * Math.PI / 180;

        return {
            x: 50 + Math.cos(angle) * radiusX,
            y: 50 + Math.sin(angle) * radiusY,
            angle: angle * 180 / Math.PI
        };
    }

    function createForkVisual(index, owner) {
        const position = getPosition(index, 23, 23);
        const element = document.createElement("div");

        element.className = "ph-table-fork" + (
            owner !== null ? " busy" : ""
        );

        element.style.left = `${position.x}%`;
        element.style.top = `${position.y}%`;
        element.style.setProperty(
            "--fork-rotation",
            `${position.angle + 90}deg`
        );

        element.innerHTML = `
            <span class="fork-head"></span>
            <span class="fork-handle"></span>
            <span class="fork-number">T${index + 1}</span>
        `;

        element.title = owner === null
            ? `Tenedor ${index + 1}: libre`
            : `Tenedor ${index + 1}: utilizado por el filósofo ${owner + 1}`;

        return element;
    }

    function createPerson(p) {
        const appearance = appearances[p.id];
        const position = getPosition(p.id, 38, 39);

        const seat = document.createElement("div");
        seat.className = `ph-seat ${p.state}`;
        seat.style.left = `${position.x}%`;
        seat.style.top = `${position.y}%`;

        seat.style.setProperty("--skin", appearance.skin);
        seat.style.setProperty("--hair", appearance.hair);
        seat.style.setProperty("--shirt", appearance.shirt);

        const person = document.createElement("div");
        person.className = "ph-person";

        person.innerHTML = `
            <div class="ph-head">
                <span class="ph-eye left"></span>
                <span class="ph-eye right"></span>
                <span class="ph-mouth"></span>
            </div>
            <div class="ph-hair"></div>
            <div class="ph-body"></div>
        `;

        const name = document.createElement("div");
        name.className = "ph-seat-name";
        name.textContent = p.name;

        const state = document.createElement("div");
        state.className = "ph-state-label";
        state.textContent = stateName(p.state);

        const plate = document.createElement("div");
        plate.className = "ph-plate" + (
            p.state === "eating" ? " food-ready" : ""
        );

        plate.style.left = `${50 + Math.cos(position.angle * Math.PI / 180) * 24}%`;
        plate.style.top = `${50 + Math.sin(position.angle * Math.PI / 180) * 24}%`;

        plate.title = `Plato de ${p.name}`;

        seat.appendChild(person);
        seat.appendChild(name);
        seat.appendChild(state);

        return { seat, plate };
    }

    function renderTable() {
        ui.table.replaceChildren();

        const tableTop = document.createElement("div");
        tableTop.className = "ph-table-top";
        ui.table.appendChild(tableTop);

        /*
         * Los platos y tenedores se sitúan sobre la mesa,
         * antes de colocar las personas alrededor.
         */
        philosophers.forEach((p) => {
            const visual = createPerson(p);
            ui.table.appendChild(visual.plate);
        });

        forks.forEach((fork) => {
            ui.table.appendChild(
                createForkVisual(fork.id, fork.owner)
            );
        });

        const center = document.createElement("div");
        center.className = "ph-center";

        const heading = document.createElement("strong");
        heading.textContent = "MESA COMPARTIDA";

        const info = document.createElement("p");

        const eatingCount = philosophers.filter(
            (p) => p.state === "eating"
        ).length;

        info.textContent = eatingCount
            ? `${eatingCount} filósofo(s) comiendo`
            : "Esperando actividad";

        center.appendChild(heading);
        center.appendChild(info);
        ui.table.appendChild(center);

        philosophers.forEach((p) => {
            const visual = createPerson(p);
            ui.table.appendChild(visual.seat);
        });

        ui.tableInfo.textContent = running
            ? "Simulación en ejecución"
            : "Estado actual de la mesa";
    }

    function renderForks() {
        ui.forks.replaceChildren();

        forks.forEach((fork) => {
            const card = document.createElement("div");

            card.className = "ph-fork" + (
                fork.owner !== null ? " busy" : ""
            );

            const symbol = document.createElement("span");
            symbol.className = "ph-fork-symbol";
            symbol.textContent = "T";

            const label = document.createElement("strong");
            label.textContent = `Tenedor ${fork.id + 1}`;

            const detail = document.createElement("span");
            detail.className = "ph-fork-detail";
            detail.textContent = fork.owner === null
                ? "Libre"
                : `Filósofo ${fork.owner + 1}`;

            card.appendChild(symbol);
            card.appendChild(label);
            card.appendChild(detail);

            ui.forks.appendChild(card);
        });
    }

    function renderActors() {
        ui.actors.replaceChildren();

        philosophers.forEach((p) => {
            const card = document.createElement("div");
            card.className = `concurrency-process ${p.state}`;

            const title = document.createElement("strong");
            title.textContent = p.name;

            const status = document.createElement("div");
            status.textContent = `Estado: ${stateName(p.state)}`;

            const meals = document.createElement("div");
            meals.textContent = `Comidas: ${p.meals}`;

            const forksText = document.createElement("div");
            forksText.textContent = p.state === "eating"
                ? `Usa T${p.leftFork + 1} y T${p.rightFork + 1}`
                : p.state === "hungry"
                    ? "Esperando dos tenedores"
                    : "No utiliza tenedores";

            card.appendChild(title);
            card.appendChild(status);
            card.appendChild(meals);
            card.appendChild(forksText);

            ui.actors.appendChild(card);
        });
    }

    function renderExplanation() {
        const eating = philosophers.filter(
            (p) => p.state === "eating"
        ).length;

        const hungry = philosophers.filter(
            (p) => p.state === "hungry"
        ).length;

        let message;

        if (eating > 0 && hungry > 0) {
            message = "Algunos filósofos comen mientras otros esperan. Cada tenedor puede pertenecer a un solo filósofo a la vez.";
        } else if (eating > 0) {
            message = "Los filósofos que consiguieron sus dos tenedores están comiendo. Los tenedores se liberan al terminar.";
        } else if (hungry > 0) {
            message = "Hay filósofos esperando. Para comenzar a comer, cada uno necesita tener disponibles sus dos tenedores vecinos.";
        } else {
            message = "Todos los filósofos están pensando. Cuando alguno tenga hambre, solicitará los dos tenedores que necesita.";
        }

        ui.explanation.textContent = message;
    }

    function renderLog() {
        ui.log.replaceChildren();

        logEntries.forEach((entry) => {
            const row = document.createElement("div");

            row.className = "ph-log-entry" + (
                entry.type ? ` ${entry.type}` : ""
            );

            const time = document.createElement("strong");
            time.textContent = `[Paso ${entry.time}] `;

            const message = document.createElement("span");
            message.textContent = entry.message;

            row.appendChild(time);
            row.appendChild(message);
            ui.log.appendChild(row);
        });
    }

    function render() {
        const eating = philosophers.filter(
            (p) => p.state === "eating"
        ).length;

        const hungry = philosophers.filter(
            (p) => p.state === "hungry"
        ).length;

        if (ui.status) {
            ui.status.textContent = running
                ? "En ejecución"
                : "En pausa";
        }

        if (ui.steps) ui.steps.textContent = String(stepCount);
        if (ui.meals) ui.meals.textContent = String(totalMeals);
        if (ui.eating) ui.eating.textContent = String(eating);
        if (ui.waiting) ui.waiting.textContent = String(hungry);

        if (ui.speedValue && ui.speed) {
            ui.speedValue.textContent = `${ui.speed.value} ms`;
        }

        if (ui.start) ui.start.disabled = running;
        if (ui.pause) ui.pause.disabled = !running;
        if (ui.step) ui.step.disabled = running;

        renderTable();
        renderForks();
        renderActors();
        renderExplanation();
        renderLog();
    }

    function stopTimer() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }

        running = false;
    }

    function startTimer() {
        if (running) return;

        running = true;

        if (timer !== null) clearInterval(timer);

        const delay = Math.max(200, Number(ui.speed?.value || 1000));

        timer = setInterval(() => {
            advanceSimulation();

            if (ui.mode && ui.mode.value === "manual") {
                stopTimer();
                render();
            }
        }, delay);

        render();
    }

    function pauseSimulation() {
        stopTimer();
        addLog("La simulación fue pausada.");
        render();
    }

    function resetSimulation() {
        stopTimer();
        initialState();
        render();
    }

    if (ui.start) {
        ui.start.addEventListener("click", startTimer);
    }

    if (ui.pause) {
        ui.pause.addEventListener("click", pauseSimulation);
    }

    if (ui.step) {
        ui.step.addEventListener("click", () => {
            if (!running) advanceSimulation();
        });
    }

    if (ui.reset) {
        ui.reset.addEventListener("click", resetSimulation);
    }

    if (ui.speed) {
        ui.speed.addEventListener("input", () => {
            if (running) {
                clearInterval(timer);
                timer = null;
                running = false;
                startTimer();
            } else {
                render();
            }
        });
    }

    if (ui.mode) {
        ui.mode.addEventListener("change", () => {
            if (ui.mode.value === "manual" && running) {
                stopTimer();
            }

            render();
        });
    }

    initialState();
})();