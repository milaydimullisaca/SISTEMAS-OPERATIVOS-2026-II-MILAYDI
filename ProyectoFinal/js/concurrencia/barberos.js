
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const ui = {
        status: $("barberStatus"),
        seats: $("barberSeats"),
        speed: $("barberSpeed"),
        speedValue: $("barberSpeedValue"),
        start: $("barberStart"),
        add: $("barberAdd"),
        step: $("barberStep"),
        pause: $("barberPause"),
        reset: $("barberReset"),
        arrived: $("barberArrived"),
        served: $("barberServed"),
        left: $("barberLeft"),
        waiting: $("barberWaiting"),
        state: $("barberState"),
        current: $("barberCurrent"),
        remaining: $("barberRemaining"),
        waitingRoom: $("barberWaitingRoom"),
        seatsStatus: $("barberSeatsStatus"),
        explanation: $("barberExplanation"),
        log: $("barberLog"),
        scene: $("barberScene"),
        sceneBadge: $("barberSceneBadge"),
        sceneMessage: $("barberSceneMessage"),
        person: $("barberPerson"),
        personLabel: $("barberPersonLabel"),
        personAction: $("barberPersonAction"),
        sleepMarks: $("barberSleepMarks"),
        clientOnChair: $("barberClientOnChair")
    };

    const HAIRCUT_DURATION = 4;

    const shirtColors = [
        "#6485a0",
        "#bd8266",
        "#8274a8",
        "#6d9979",
        "#d0a14f",
        "#b76f87",
        "#638f94",
        "#8d785e"
    ];

    const hairColors = [
        "#49382e",
        "#302b29",
        "#79553b",
        "#5c4540",
        "#a17b4b",
        "#403b49"
    ];

    let queue = [];
    let currentClient = null;
    let remainingTime = 0;
    let nextClientId = 1;
    let arrivedCount = 0;
    let servedCount = 0;
    let leftCount = 0;
    let tickCount = 0;
    let timer = null;
    let running = false;
    let initialized = false;

    function capacity() {
        const value = Number(ui.seats.value);

        if (!Number.isFinite(value)) {
            return 3;
        }

        return Math.max(1, Math.min(10, Math.floor(value)));
    }

    function log(message) {
        const entry = document.createElement("p");
        entry.textContent = `[Paso ${tickCount}] ${message}`;

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

    function startHaircut(client) {
        currentClient = client;
        remainingTime = HAIRCUT_DURATION;

        log(`El barbero comienza a atender al cliente ${client.id}.`);
    }

    function arriveCustomer() {
        arrivedCount++;

        const client = {
            id: nextClientId++,
            arrival: tickCount,
            shirt: shirtColors[(nextClientId - 2) % shirtColors.length],
            hair: hairColors[(nextClientId - 2) % hairColors.length]
        };

        log(`Llega el cliente ${client.id}.`);

        if (currentClient === null) {
            startHaircut(client);

            log(
                `El cliente ${client.id} despierta al barbero y recibe atención.`
            );

            setStatus(
                `El cliente ${client.id} despertó al barbero.`,
                "success"
            );

            render();
            return;
        }

        if (queue.length < capacity()) {
            queue.push(client);

            log(`El cliente ${client.id} ocupa una silla de espera.`);

            setStatus(`El cliente ${client.id} espera su turno.`);
        } else {
            leftCount++;

            log(
                `El cliente ${client.id} se marcha: no hay sillas disponibles.`
            );

            setStatus(
                `El cliente ${client.id} se fue porque la sala está llena.`,
                "warning"
            );
        }

        render();
    }

    function advanceSimulation() {
        if (!initialized) {
            initialize();
        }

        tickCount++;

        if (running && tickCount % 3 === 0) {
            arriveCustomer();
        }

        if (currentClient !== null) {
            remainingTime--;

            if (remainingTime <= 0) {
                const finishedClient = currentClient;

                servedCount++;

                log(
                    `El barbero termina de atender al cliente ${finishedClient.id}.`
                );

                currentClient = null;
                remainingTime = 0;

                if (queue.length > 0) {
                    const nextClient = queue.shift();

                    log(
                        `El cliente ${nextClient.id} pasa de la sala de espera a la silla del barbero.`
                    );

                    startHaircut(nextClient);
                } else {
                    log("No quedan clientes. El barbero se duerme.");

                    setStatus(
                        "No hay clientes. El barbero está dormido."
                    );
                }
            }
        }

        render();
    }

    function createWaitingSeat(client, index) {
        const seat = document.createElement("div");
        seat.className = "barber-visual-seat";

        const person = document.createElement("div");
        person.className = "seat-person";

        const head = document.createElement("span");
        head.className = "seat-person-head";
        head.style.setProperty("--seat-hair", client.hair);

        const body = document.createElement("span");
        body.className = "seat-person-body";
        body.style.setProperty("--seat-shirt", client.shirt);

        person.append(head, body);

        const chair = document.createElement("div");
        chair.className = "seat-chair";

        const label = document.createElement("span");
        label.className = "barber-seat-label";
        label.textContent = `Cliente ${client.id}`;

        seat.classList.add("occupied");
        seat.setAttribute(
            "aria-label",
            `Silla ${index + 1}, ocupada por el cliente ${client.id}`
        );

        seat.append(person, chair, label);

        return seat;
    }

    function createEmptySeat(index) {
        const seat = document.createElement("div");
        seat.className = "barber-visual-seat";

        const chair = document.createElement("div");
        chair.className = "seat-chair";

        const label = document.createElement("span");
        label.className = "barber-seat-label";
        label.textContent = `Silla ${index + 1} libre`;

        seat.setAttribute("aria-label", `Silla ${index + 1} libre`);
        seat.append(chair, label);

        return seat;
    }

    function renderWaitingRoom() {
        ui.waitingRoom.replaceChildren();

        const totalSeats = capacity();

        if (queue.length === 0) {
            const empty = document.createElement("div");
            empty.className = "barber-empty-room";

            const icon = document.createElement("span");
            icon.className = "barber-empty-icon";
            icon.textContent = "♧";

            const message = document.createElement("span");
            message.textContent = "No hay clientes esperando";

            empty.append(icon, message);
            ui.waitingRoom.appendChild(empty);
        }

        for (let i = 0; i < totalSeats; i++) {
            if (i < queue.length) {
                ui.waitingRoom.appendChild(
                    createWaitingSeat(queue[i], i)
                );
            } else {
                ui.waitingRoom.appendChild(createEmptySeat(i));
            }
        }

        ui.seatsStatus.textContent =
            `Sillas ocupadas: ${queue.length} de ${totalSeats}`;
    }

    function renderScene() {
        const working = currentClient !== null;
        const full = queue.length >= capacity();

        ui.scene.classList.toggle("working", working);
        ui.scene.classList.toggle("sleeping", !working);
        ui.scene.classList.toggle("full", full && !working);

        ui.clientOnChair.hidden = !working;

        if (working) {
            ui.sceneBadge.textContent = "Atendiendo";
            ui.personLabel.textContent = "Barbero";
            ui.personAction.textContent = "Está cortando el cabello";

            ui.person.setAttribute(
                "aria-label",
                `Barbero trabajando con el cliente ${currentClient.id}`
            );

            ui.sceneMessage.textContent =
                `El barbero está atendiendo al cliente ${currentClient.id}. ` +
                `Quedan ${remainingTime} pasos para terminar el corte.`;

            ui.clientOnChair.setAttribute(
                "aria-label",
                `Cliente ${currentClient.id} recibiendo un corte de cabello`
            );

            ui.clientOnChair.style.setProperty(
                "--client-shirt",
                currentClient.shirt
            );
        } else {
            ui.sceneBadge.textContent = full ? "Sala llena" : "En descanso";
            ui.personLabel.textContent = "Barbero";
            ui.personAction.textContent = "Está durmiendo";

            ui.person.setAttribute(
                "aria-label",
                "Barbero dormido en su sillón"
            );

            ui.sceneMessage.textContent = queue.length > 0
                ? "El barbero está libre y hay clientes esperando."
                : "El barbero descansa hasta que llegue el próximo cliente.";
        }

        if (working && full) {
            ui.sceneBadge.textContent = "Sala llena";
        }
    }

    function render() {
        ui.arrived.textContent = arrivedCount;
        ui.served.textContent = servedCount;
        ui.left.textContent = leftCount;
        ui.waiting.textContent = queue.length;

        if (currentClient === null) {
            ui.state.textContent = "Barbero dormido";
            ui.current.textContent =
                "No hay ningún cliente en atención.";
            ui.remaining.textContent = "Tiempo restante: 0 pasos";
        } else {
            ui.state.textContent = "Barbero trabajando";
            ui.current.textContent =
                `Atendiendo al cliente ${currentClient.id}.`;
            ui.remaining.textContent =
                `Tiempo restante: ${remainingTime} pasos`;
        }

        if (currentClient === null && queue.length === 0) {
            ui.explanation.textContent =
                "No hay clientes. El barbero duerme hasta que llegue alguien.";
        } else if (currentClient !== null && queue.length === 0) {
            ui.explanation.textContent =
                "El barbero está ocupado y no hay clientes esperando.";
        } else if (queue.length < capacity()) {
            ui.explanation.textContent =
                "El barbero atiende a un cliente mientras los demás esperan en las sillas disponibles.";
        } else {
            ui.explanation.textContent =
                "La sala de espera está llena. Los nuevos clientes que lleguen tendrán que marcharse.";
        }

        renderWaitingRoom();
        renderScene();

        ui.add.disabled = !initialized;
        ui.step.disabled = running;
        ui.start.disabled = running;
        ui.pause.disabled = !running;
        ui.seats.disabled = running;
    }

    function stopTimer() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startTimer() {
        stopTimer();

        if (!running) {
            return;
        }

        timer = setInterval(
            advanceSimulation,
            Number(ui.speed.value)
        );
    }

    function startSimulation() {
        if (!initialized) {
            initialize();
        }

        if (running) {
            return;
        }

        running = true;

        setStatus("Simulación automática en ejecución.", "success");
        startTimer();
        render();
    }

    function pauseSimulation() {
        running = false;
        stopTimer();

        setStatus("Simulación pausada.");
        render();
    }

    function initialize() {
        stopTimer();

        queue = [];
        currentClient = null;
        remainingTime = 0;
        nextClientId = 1;
        arrivedCount = 0;
        servedCount = 0;
        leftCount = 0;
        tickCount = 0;
        running = false;
        initialized = true;

        ui.log.replaceChildren();

        log("La barbería está preparada.");
        log(`Hay ${capacity()} sillas de espera disponibles.`);
        log("El barbero está dormido porque no hay clientes.");

        setStatus(
            "Barbería preparada. Puedes iniciar o añadir un cliente."
        );

        render();
    }

    ui.start.addEventListener("click", startSimulation);

    ui.add.addEventListener("click", () => {
        if (!initialized) {
            initialize();
        }

        arriveCustomer();
    });

    ui.step.addEventListener("click", () => {
        if (running) {
            return;
        }

        advanceSimulation();
    });

    ui.pause.addEventListener("click", pauseSimulation);

    ui.reset.addEventListener("click", initialize);

    ui.speed.addEventListener("input", () => {
        ui.speedValue.textContent =
            `${ui.speed.value} ms por paso`;

        if (running) {
            startTimer();
        }
    });

    ui.seats.addEventListener("change", () => {
        ui.seats.value = capacity();

        setStatus(
            `La sala tiene ${capacity()} sillas de espera.`
        );

        render();
    });

    initialize();
});
