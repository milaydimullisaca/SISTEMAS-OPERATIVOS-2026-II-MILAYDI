document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    const app = $("producerConsumerApp");

    if (!app || !$("pcBuffer")) return;

    const ui = {
        status: $("pcStatus"),
        capacity: $("pcCapacity"),
        mode: $("pcMode"),
        speed: $("pcSpeed"),
        speedValue: $("pcSpeedValue"),
        start: $("pcStart"),
        step: $("pcStep"),
        pause: $("pcPause"),
        reset: $("pcReset"),
        produce: $("pcProduce"),
        consume: $("pcConsume"),
        produced: $("pcProduced"),
        consumed: $("pcConsumed"),
        available: $("pcAvailable"),
        free: $("pcFree"),
        bufferCount: $("pcBufferCount"),
        bufferCapacity: $("pcBufferCapacity"),
        buffer: $("pcBuffer"),
        progress: $("pcProgress"),
        bufferMessage: $("pcBufferMessage"),
        producerCard: $("pcProducerCard"),
        consumerCard: $("pcConsumerCard"),
        producerState: $("pcProducerState"),
        consumerState: $("pcConsumerState"),
        producerIndicator: $("pcProducerIndicator"),
        consumerIndicator: $("pcConsumerIndicator"),
        emptySemaphore: $("pcEmptySemaphore"),
        fullSemaphore: $("pcFullSemaphore"),
        mutex: $("pcMutex"),
        explanation: $("pcExplanation"),
        log: $("pcLog")
    };

    let buffer = [];
    let capacity = Number(ui.capacity.value) || 5;
    let produced = 0;
    let consumed = 0;
    let nextId = 1;
    let running = false;
    let paused = false;
    let busy = false;
    let timer = null;
    let operationId = 0;
    let turn = "producer";

    const products = [
        { name: "Pan", className: "product-1", code: "PAN" },
        { name: "Caja", className: "product-2", code: "CAJ" },
        { name: "Fruta", className: "product-3", code: "FRU" },
        { name: "Paquete", className: "product-4", code: "PAQ" },
        { name: "Producto", className: "product-5", code: "PRO" }
    ];

    function log(message, type = "") {
        const entry = document.createElement("div");
        entry.className = `pc-log-entry ${type ? `pc-log-${type}` : ""}`;

        const time = new Date().toLocaleTimeString("es-PE", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        entry.textContent = `[${time}] ${message}`;
        ui.log.prepend(entry);

        while (ui.log.children.length > 45) {
            ui.log.lastElementChild.remove();
        }
    }

    function explain(message) {
        ui.explanation.textContent = message;
    }

    function setStatus(text, state) {
        ui.status.textContent = text;
        ui.status.className = `pc-status ${state}`;
        app.classList.toggle("pc-running", state === "running");
    }

    function setWorker(which, state, message) {
        const producer = which === "producer";
        const card = producer ? ui.producerCard : ui.consumerCard;
        const label = producer ? ui.producerState : ui.consumerState;
        const meter = producer ? ui.producerIndicator : ui.consumerIndicator;

        card.classList.remove("pc-process-active", "pc-process-waiting");
        card.classList.toggle("pc-process-active", state === "active");
        card.classList.toggle("pc-process-waiting", state === "waiting");

        label.textContent = message;
        meter.style.width =
            state === "active" ? "100%" :
            state === "waiting" ? "35%" : "0%";
    }

    function renderBuffer() {
        ui.buffer.replaceChildren();

        for (let i = 0; i < capacity; i++) {
            const slot = document.createElement("div");
            slot.className = "pc-slot";

            const item = buffer[i];

            if (item) {
                const product = document.createElement("div");
                product.className = `pc-product ${item.className}`;
                product.textContent = item.code;
                product.title = `${item.name} ${item.id}`;
                product.setAttribute("aria-label", `${item.name} número ${item.id}`);

                const number = document.createElement("span");
                number.className = "pc-slot-number";
                number.textContent = `#${item.id}`;

                slot.append(product, number);
            } else {
                const empty = document.createElement("span");
                empty.className = "pc-slot-number";
                empty.textContent = `ESPACIO ${i + 1}`;
                slot.appendChild(empty);
            }

            ui.buffer.appendChild(slot);
        }

        const count = buffer.length;
        const free = capacity - count;

        ui.produced.textContent = produced;
        ui.consumed.textContent = consumed;
        ui.available.textContent = count;
        ui.free.textContent = free;
        ui.bufferCount.textContent = count;
        ui.bufferCapacity.textContent = capacity;
        ui.emptySemaphore.textContent = free;
        ui.fullSemaphore.textContent = count;
        ui.mutex.textContent = busy ? "Ocupado" : "Libre";

        ui.mutex.style.color = busy ? "#dc2626" : "#059669";

        ui.progress.style.width = `${count / capacity * 100}%`;

        if (count === 0) {
            ui.bufferMessage.textContent =
                "La cinta está vacía. El consumidor debe esperar un producto.";
        } else if (count === capacity) {
            ui.bufferMessage.textContent =
                "La cinta está llena. El productor debe esperar un espacio libre.";
        } else {
            ui.bufferMessage.textContent =
                `Hay ${count} producto(s) en la cinta y ${free} espacio(s) libre(s).`;
        }
    }

    function renderStatus() {
        if (paused) {
            setStatus("Pausado", "paused");
        } else if (running) {
            setStatus("En ejecución", "running");
        } else {
            setStatus("Detenido", "stopped");
        }
    }

    function stopTimer() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startTimer() {
        stopTimer();

        if (!running || paused || ui.mode.value !== "auto") return;

        timer = setInterval(() => {
            if (!busy && running && !paused) {
                executeOperation(turn);
            }
        }, Number(ui.speed.value) || 1000);
    }

    function finishOperation(which, message, type, explanation) {
        busy = false;

        setWorker(which, "ready", "Preparado");
        ui.mutex.textContent = "Libre";
        ui.mutex.style.color = "#059669";

        renderBuffer();
        explain(explanation);
        log(message, type);

        if (running && !paused && ui.mode.value === "auto") {
            startTimer();
        }
    }

    function executeOperation(which) {
        if (busy) return false;

        const isProducer = which === "producer";

        if (isProducer && buffer.length >= capacity) {
            setWorker("producer", "waiting", "Esperando espacio libre");
            explain(
                "El buffer está lleno. El productor no puede fabricar otro producto hasta que el consumidor retire uno."
            );
            log("El productor espera: el buffer está lleno.", "wait");
            turn = "consumer";
            return false;
        }

        if (!isProducer && buffer.length === 0) {
            setWorker("consumer", "waiting", "Esperando producto");
            explain(
                "El buffer está vacío. El consumidor no puede retirar nada hasta que el productor fabrique un producto."
            );
            log("El consumidor espera: el buffer está vacío.", "wait");
            turn = "producer";
            return false;
        }

        busy = true;
        operationId++;

        const currentOperation = operationId;
        const delay = 450;

        renderBuffer();
        ui.mutex.textContent = "Ocupado";
        ui.mutex.style.color = "#dc2626";

        if (isProducer) {
            setWorker("producer", "active", "Fabricando producto...");
            setWorker("consumer", "ready", "Esperando producto");
            explain(
                "El productor está utilizando el buffer de forma exclusiva para fabricar y almacenar un producto."
            );
        } else {
            setWorker("consumer", "active", "Retirando producto...");
            setWorker("producer", "ready", "Esperando espacio");
            explain(
                "El consumidor está accediendo al buffer para retirar el producto más antiguo."
            );
        }

        if (isProducer) {
            const id = nextId++;
            const kind = products[(id - 1) % products.length];

            window.setTimeout(() => {
                if (currentOperation !== operationId) return;

                buffer.push({
                    id,
                    name: kind.name,
                    code: kind.code,
                    className: kind.className
                });

                produced++;
                turn = "consumer";

                finishOperation(
                    "producer",
                    `Producto ${kind.name} #${id} fabricado y colocado en la cinta.`,
                    "produce",
                    `El productor fabricó ${kind.name} #${id}. El semáforo full aumentó y el número de espacios libres disminuyó.`
                );
            }, delay);
        } else {
            const item = buffer[0];

            window.setTimeout(() => {
                if (currentOperation !== operationId) return;

                buffer.shift();
                consumed++;
                turn = "producer";

                finishOperation(
                    "consumer",
                    `${item.name} #${item.id} retirado y consumido.`,
                    "consume",
                    `El consumidor retiró ${item.name} #${item.id}. El semáforo empty aumentó y ahora hay más espacio para producir.`
                );
            }, delay);
        }

        return true;
    }

    function startSimulation() {
        if (busy) return;

        running = true;
        paused = false;

        renderStatus();
        log("La fábrica se ha iniciado.");

        explain(
            ui.mode.value === "auto"
                ? "La fábrica está funcionando automáticamente. El productor y el consumidor se alternan."
                : "Modo manual activado. Presiona «Siguiente paso» o utiliza los botones individuales."
        );

        startTimer();
    }

    function pauseSimulation() {
        stopTimer();
        running = false;
        paused = true;

        renderStatus();
        log("La simulación está pausada.");
        explain("La fábrica está pausada. Puedes reanudarla con «Iniciar fábrica».");
    }

    function resetSimulation() {
        stopTimer();

        operationId++;
        buffer = [];
        capacity = Number(ui.capacity.value) || 5;
        produced = 0;
        consumed = 0;
        nextId = 1;
        running = false;
        paused = false;
        busy = false;
        turn = "producer";

        setWorker("producer", "ready", "Preparado");
        setWorker("consumer", "ready", "Preparado");
        renderBuffer();
        renderStatus();

        ui.log.replaceChildren();

        explain(
            "La fábrica está lista. Inicia la simulación para fabricar productos, transportarlos y consumirlos."
        );

        log("Fábrica reiniciada. Buffer vacío.");
    }

    ui.start.addEventListener("click", startSimulation);
    ui.pause.addEventListener("click", pauseSimulation);
    ui.reset.addEventListener("click", resetSimulation);

    ui.step.addEventListener("click", () => {
        if (busy) return;

        if (!running) {
            running = true;
            paused = false;
        }

        stopTimer();
        renderStatus();
        executeOperation(turn);
    });

    ui.produce.addEventListener("click", () => {
        stopTimer();

        if (!running) {
            running = true;
            paused = false;
        }

        renderStatus();
        executeOperation("producer");
    });

    ui.consume.addEventListener("click", () => {
        stopTimer();

        if (!running) {
            running = true;
            paused = false;
        }

        renderStatus();
        executeOperation("consumer");
    });

    ui.capacity.addEventListener("change", () => {
        if (busy) return;

        const newCapacity = Number(ui.capacity.value);

        if (!Number.isFinite(newCapacity) || newCapacity < buffer.length) {
            ui.capacity.value = String(capacity);
            explain("La capacidad no puede ser menor que la cantidad de productos almacenados.");
            return;
        }

        capacity = newCapacity;
        renderBuffer();

        log(`La capacidad del buffer cambió a ${capacity} espacios.`);
    });

    ui.speed.addEventListener("input", () => {
        ui.speedValue.textContent = `${ui.speed.value} ms`;

        if (running && !paused && ui.mode.value === "auto") {
            startTimer();
        }
    });

    ui.mode.addEventListener("change", () => {
        stopTimer();

        if (running && !paused && ui.mode.value === "auto") {
            startTimer();
        }

        explain(
            ui.mode.value === "auto"
                ? "Modo automático: los procesos se ejecutan según la velocidad seleccionada."
                : "Modo manual: controla cada operación con «Siguiente paso», «Fabricar producto» o «Consumir producto»."
        );
    });

    resetSimulation();
});
