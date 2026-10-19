const $ = id => document.getElementById(id);

const ui = {
    status: $("systemStatus"),
    completed: $("completedCount"),
    round: $("currentRound"),
    roundStatus: $("roundStatus"),
    active: $("activeParticipant"),
    activeDescription: $("activeDescription"),
    elapsed: $("elapsedTime"),
    contexts: $("contextCount"),
    progress: $("progressBar"),

    roundLimit: $("roundLimit"),
    executionMode: $("executionMode"),
    agentMode: $("agentMode"),
    selectionMode: $("selectionMode"),
    speed: $("speedRange"),
    speedValue: $("speedValue"),

    start: $("btnStart"),
    pause: $("btnPause"),
    step: $("btnStep"),
    reset: $("btnReset"),
    place: $("btnPlace"),
    pair: $("ingredientPair"),
    missing: $("missingIngredient"),

    agentCard: $("agentCard"),
    agentBadge: $("agentBadge"),
    agentStatus: $("agentStatus"),
    table: $("tableArea"),
    tableBadge: $("tableBadge"),
    tableStatus: $("tableStatus"),
    item1: $("item1"),
    item2: $("item2"),
    semAgent: $("semAgente"),

    title: $("stepTitle"),
    explanation: $("stepExplanation"),
    conceptBadge: $("conceptBadge"),
    log: $("consoleLog")
};

const smokers = {
    1: {
        name: "Fumador 1",
        owns: "tabaco",
        needs: ["papel", "cerillas"]
    },
    2: {
        name: "Fumador 2",
        owns: "papel",
        needs: ["tabaco", "cerillas"]
    },
    3: {
        name: "Fumador 3",
        owns: "cerillas",
        needs: ["tabaco", "papel"]
    }
};

const ingredientNames = {
    tabaco: "Tabaco",
    papel: "Papel",
    cerillas: "Cerillas"
};

/*
 * Cada pareja corresponde al fumador que posee
 * el tercer ingrediente.
 */
const pairsForSmoker = {
    1: ["papel", "cerillas"],
    2: ["tabaco", "cerillas"],
    3: ["tabaco", "papel"]
};

const concepts = {
    concurrency: {
        title: "Concurrencia",
        description:
            "Varias actividades progresan durante un mismo intervalo de tiempo. Sus operaciones pueden intercalarse y necesitan coordinación.",
        example:
            "El agente y los tres fumadores son participantes diferentes que deben respetar los turnos y la disponibilidad de los ingredientes."
    },
    parallelism: {
        title: "Paralelismo",
        description:
            "Ocurre cuando dos o más tareas se ejecutan físicamente al mismo tiempo, por ejemplo, en diferentes núcleos de CPU.",
        example:
            "Esta aplicación web representa las actividades, pero no crea cuatro hilos reales del sistema operativo."
    },
    context: {
        title: "Cambio de contexto",
        description:
            "En un sistema operativo, el procesador guarda el estado de una tarea y restaura el de otra para continuar su ejecución.",
        example:
            "La interfaz muestra el cambio de turno entre agente y fumador como analogía didáctica, no como un cambio de contexto real de CPU."
    },
    critical: {
        title: "Sección crítica",
        description:
            "Es una parte del programa que accede a un recurso compartido y debe protegerse frente a accesos incompatibles.",
        example:
            "La mesa es el recurso compartido. La parte en la que se retiran los ingredientes debe estar controlada para evitar que dos participantes intenten utilizarlos de forma incompatible."
    },
    race: {
        title: "Condición de carrera",
        description:
            "Sucede cuando el resultado depende del orden de operaciones concurrentes sobre un estado compartido sin sincronización adecuada.",
        example:
            "Sin el monitor, dos fumadores podrían intentar reclamar los mismos ingredientes. Esta ejecución controlada evita esa situación; no afirma detectar una carrera real."
    },
    deadlock: {
        title: "Deadlock",
        description:
            "Un conjunto de procesos queda bloqueado y ninguno puede avanzar porque espera recursos o acciones que dependen entre sí.",
        example:
            "El protocolo evita que los fumadores retengan ingredientes mientras esperan otros. La selección por turnos ayuda a distribuir las oportunidades, aunque la equidad depende de que el agente siga proporcionando las parejas necesarias."
    },
    starvation: {
        title: "Inanición",
        description:
            "Un proceso puede esperar indefinidamente si otros reciben los recursos o turnos una y otra vez.",
        example:
            "La política por turnos distribuye las parejas de ingredientes entre los fumadores. La equidad depende de que el agente siga proporcionando oportunidades."
    },
    semaphore: {
        title: "Semáforos",
        description:
            "Los semáforos son mecanismos de sincronización que permiten esperar y señalizar la disponibilidad de recursos.",
        example:
            "Los indicadores 0 y 1 de esta página son representaciones visuales. No son semáforos nativos del sistema operativo."
    }
};

/* Estado general de la simulación. */

let running = false;
let paused = false;
let finished = false;

let phase = "waitingAgent";
let tableIngredients = [];
let activeSmoker = null;

let completed = 0;
let round = 1;
let contextChanges = 0;
let elapsedMs = 0;
let phaseElapsed = 0;
let lastTick = 0;

let smokerCounts = { 1: 0, 2: 0, 3: 0 };

let timerId = null;
let logStart = Date.now();
let selectedConcept = "concurrency";

/*
 * Duración aproximada de cada etapa.
 * La velocidad se puede cambiar durante la simulación.
 */
const stageDuration = () => Number(ui.speed.value);

function limit() {
    return Number(ui.roundLimit.value);
}

function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);

    return (
        String(minutes).padStart(2, "0") + ":" +
        String(seconds % 60).padStart(2, "0")
    );
}

function logEvent(message) {
    const entry = document.createElement("p");
    entry.className = "log-entry";

    const time = document.createElement("time");
    time.textContent = formatTime(Date.now() - logStart);

    const text = document.createElement("span");
    text.textContent = message;

    entry.replaceChildren(time, text);
    ui.log.appendChild(entry);
    ui.log.scrollTop = ui.log.scrollHeight;
}

function setExplanation(title, description, concept = "semaphore") {
    ui.title.textContent = title;
    ui.explanation.textContent = description;
    ui.conceptBadge.textContent = concepts[concept].title;
}

function selectConcept(name) {
    selectedConcept = name;

    const concept = concepts[name];

    $("conceptTitle").textContent = concept.title;
    $("conceptDescription").textContent = concept.description;
    $("conceptExample").textContent = concept.example;

    document.querySelectorAll(".concept-button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.concept === name
        );
    });
}

function setParticipant(name, description) {
    ui.active.textContent = name;
    ui.activeDescription.textContent = description;
}

function setSemaphore(id, value) {
    const element = id === 0 ? ui.semAgent : $(`semF${id}`);

    element.textContent = String(value);
    element.classList.toggle("available", value === 1);
    element.classList.toggle("blocked", value === 0);
}

function setAgentState(description, hasTurn) {
    ui.agentStatus.textContent = description;
    ui.agentBadge.textContent = hasTurn ? "Tiene el turno" : "Esperando";
    ui.agentCard.classList.toggle("active", hasTurn);
}

function setSmokerState(id, state) {
    const card = $(`cardF${id}`);
    const badge = $(`badgeF${id}`);

    badge.textContent = state;
    card.classList.toggle(
        "active",
        state === "Tomando ingredientes" || state === "Fumando"
    );
}

function renderIngredient(element, ingredient) {
    element.className = "ingredient";

    if (!ingredient) {
        element.classList.add("empty");
        element.textContent = "Vacío";
        return;
    }

    element.classList.add(ingredient);
    element.textContent = ingredientNames[ingredient];
}

function renderTable() {
    renderIngredient(ui.item1, tableIngredients[0]);
    renderIngredient(ui.item2, tableIngredients[1]);

    const occupied = tableIngredients.length > 0;

    ui.table.classList.toggle("occupied", occupied);
    ui.tableBadge.textContent = occupied ? "Mesa ocupada" : "Mesa libre";

    ui.tableStatus.textContent = occupied
        ? `En la mesa: ${tableIngredients.map(x => ingredientNames[x]).join(" y ")}.`
        : "No hay ingredientes sobre la mesa.";
}

function findEligibleSmoker(ingredients) {
    return Number(
        Object.keys(smokers).find(id =>
            !ingredients.includes(smokers[id].owns) &&
            smokers[id].needs.every(item => ingredients.includes(item))
        )
    );
}

function updateMissingText() {
    const pair = ui.pair.value.split(",");
    const id = findEligibleSmoker(pair);

    ui.missing.textContent =
        `${smokers[id].name} podrá fumar porque posee ${smokers[id].owns}.`;
}

function choosePair() {
    if (ui.selectionMode.value === "turns") {
        /*
         * Reparte las oportunidades en orden:
         * F1, F2, F3, F1...
         */
        const target = (completed % 3) + 1;
        return [...pairsForSmoker[target]];
    }

    const pairs = Object.values(pairsForSmoker);
    return [...pairs[Math.floor(Math.random() * pairs.length)]];
}

function updateStatistics() {
    const max = limit();
    const progress = max === 0
        ? 0
        : Math.min(100, (completed / max) * 100);

    ui.completed.textContent =
        max === 0 ? `${completed} completadas` : `${completed} / ${max}`;

    ui.progress.style.width = `${progress}%`;
    ui.round.textContent = String(round);
    ui.elapsed.textContent = formatTime(elapsedMs);
    ui.contexts.textContent = `Cambios de turno: ${contextChanges}`;

    for (const id of [1, 2, 3]) {
        $(`countF${id}`).textContent = String(smokerCounts[id]);

        const percentage = completed === 0
            ? 0
            : Math.round((smokerCounts[id] / completed) * 100);

        $(`percentF${id}`).textContent = `${percentage}%`;
        $(`barF${id}`).style.width = `${percentage}%`;
    }

    if (finished) {
        ui.roundStatus.textContent = "Finalizada";
    } else if (phase === "waitingAgent") {
        ui.roundStatus.textContent = "Esperando ingredientes";
    } else {
        ui.roundStatus.textContent = "En progreso";
    }
}

function updateControls() {
    ui.start.disabled = running && !paused;
    ui.pause.disabled = !running || paused || finished;

    ui.step.disabled =
        finished ||
        ui.executionMode.value !== "step" ||
        !running ||
        paused;

    ui.place.disabled =
        finished ||
        !running ||
        paused ||
        ui.agentMode.value !== "manual" ||
        phase !== "waitingAgent";

    ui.roundLimit.disabled = running && !finished;
    ui.executionMode.disabled = running && !finished;
    ui.agentMode.disabled = running && !finished;
    ui.selectionMode.disabled = running && !finished;
    ui.pair.disabled = ui.agentMode.value !== "manual" ||
        (running && phase !== "waitingAgent");

    if (ui.executionMode.value === "step") {
        ui.step.textContent = "Siguiente paso";
    } else {
        ui.step.textContent = "Paso a paso (elige modo)";
    }
}

function startTimer() {
    stopTimer();
    lastTick = performance.now();

    timerId = setInterval(() => {
        const now = performance.now();
        const delta = now - lastTick;
        lastTick = now;

        if (!running || paused || finished) {
            return;
        }

        elapsedMs += delta;

        if (ui.executionMode.value === "auto") {
            if (phase !== "waitingAgent" || ui.agentMode.value === "auto") {
                phaseElapsed += delta;

                if (phaseElapsed >= stageDuration()) {
                    phaseElapsed = 0;
                    advanceStage();
                }
            }
        }

        updateStatistics();
    }, 100);
}

function stopTimer() {
    if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
    }
}

function finishSimulation() {
    running = false;
    paused = false;
    finished = true;

    stopTimer();

    ui.status.textContent = "Finalizada";
    setParticipant("Ninguno", "Todas las rondas solicitadas terminaron");
    setAgentState("La simulación ha concluido", false);
    setExplanation(
        "Simulación completada",
        `Se completaron ${completed} rondas. Revisa las estadísticas y el registro de eventos para analizar el comportamiento de los fumadores.`,
        "semaphore"
    );

    logEvent(`Simulación finalizada. Rondas completadas: ${completed}.`);

    updateStatistics();
    updateControls();
}

function startSimulation() {
    if (finished) {
        return;
    }

    if (running && paused) {
        paused = false;
        ui.status.textContent = "En ejecución";
        logEvent("Simulación reanudada.");
        setExplanation(
            "Simulación reanudada",
            "El monitor conserva la etapa y el estado de la mesa. La ejecución continúa desde el punto de pausa.",
            "semaphore"
        );
        lastTick = performance.now();
        updateControls();
        return;
    }

    if (running) {
        return;
    }

    running = true;
    paused = false;
    ui.status.textContent = "En ejecución";

    logEvent("Simulación iniciada.");
    setExplanation(
        "Monitor activo",
        "El monitor espera la pareja de ingredientes, identifica al fumador elegible y coordina la liberación de la mesa.",
        "semaphore"
    );

    setAgentState(
        ui.agentMode.value === "manual"
            ? "Esperando tu selección de ingredientes"
            : "Preparado para proporcionar ingredientes",
        true
    );

    setSemaphore(0, 1);
    setParticipant("Agente", "Puede proporcionar la siguiente pareja");

    startTimer();
    updateControls();
}

function pauseSimulation() {
    if (!running || paused || finished) {
        return;
    }

    paused = true;
    ui.status.textContent = "Pausada";

    logEvent("Simulación pausada. El estado actual se conserva.");

    setExplanation(
        "Ejecución pausada",
        "La mesa, los ingredientes, la etapa actual y los contadores se mantienen. Pulsa Continuar para seguir.",
        "semaphore"
    );

    updateControls();
}

function placeIngredients(ingredients) {
    if (!running || paused || finished) {
        logEvent("No se pueden colocar ingredientes: inicia o reanuda la simulación.");
        return;
    }

    if (phase !== "waitingAgent" || tableIngredients.length !== 0) {
        logEvent("La mesa no está disponible. El monitor rechaza la colocación.");
        return;
    }

    if (!Array.isArray(ingredients) ||
        ingredients.length !== 2 ||
        ingredients[0] === ingredients[1]) {
        logEvent("La pareja de ingredientes no es válida.");
        return;
    }

    const eligible = findEligibleSmoker(ingredients);

    if (!eligible) {
        logEvent("El monitor no encontró un fumador elegible para esa pareja.");
        return;
    }

    /*
     * El monitor recibe la pareja y la publica de forma atómica
     * dentro del modelo de la interfaz.
     */
    tableIngredients = [...ingredients];
    activeSmoker = eligible;
    phase = "smokerReady";
    phaseElapsed = 0;

    setSemaphore(0, 0);
    setSemaphore(eligible, 1);

    setAgentState("Ha entregado los ingredientes y espera", false);
    setParticipant(smokers[eligible].name, "Tiene los ingredientes que necesita");

    for (const id of [1, 2, 3]) {
        setSmokerState(id, id === eligible ? "Puede avanzar" : "Esperando");
        setSemaphore(id, id === eligible ? 1 : 0);
    }

    renderTable();

    const pairText = ingredients.map(x => ingredientNames[x]).join(" y ");

    logEvent(`El agente proporciona ${pairText}.`);
    logEvent(`El monitor despierta a ${smokers[eligible].name}.`);

    setExplanation(
        `${smokers[eligible].name} puede avanzar`,
        `La pareja disponible es ${pairText}. ${smokers[eligible].name} ya posee ${smokers[eligible].owns}, por lo que reúne los tres ingredientes necesarios.`,
        "semaphore"
    );

    updateStatistics();
    updateControls();
}

function releaseTable() {
    const id = activeSmoker;

    if (!id || tableIngredients.length !== 2) {
        logEvent("El monitor detectó un estado inconsistente y no liberó la mesa.");
        return;
    }

    tableIngredients = [];
    activeSmoker = null;

    completed++;
    smokerCounts[id]++;

    contextChanges += 2;

    setSemaphore(id, 0);
    setSemaphore(0, 1);

    for (const smokerId of [1, 2, 3]) {
        setSmokerState(smokerId, "Esperando");
        setSemaphore(smokerId, 0);
    }

    setAgentState("Puede colocar una nueva pareja", true);
    setParticipant("Agente", "La mesa está libre");

    renderTable();

    logEvent(`${smokers[id].name} terminó de fumar y liberó la mesa.`);
    logEvent("El monitor devuelve el turno al agente.");

    setExplanation(
        "Mesa liberada",
        "El fumador terminó, la mesa quedó libre y el agente puede comenzar otra ronda. La coordinación evita que dos fumadores reclamen la misma pareja.",
        "critical"
    );

    round = completed + 1;
    phase = "waitingAgent";
    phaseElapsed = 0;

    updateStatistics();

    if (limit() !== 0 && completed >= limit()) {
        finishSimulation();
    } else {
        updateControls();
    }
}

function advanceStage() {
    if (!running || paused || finished) {
        return;
    }

    if (phase === "waitingAgent") {
        if (ui.agentMode.value === "manual") {
            logEvent("El monitor espera que el usuario proporcione una pareja de ingredientes.");
            setExplanation(
                "Esperando al agente",
                "En el modo manual, selecciona la pareja de ingredientes y pulsa Colocar ingredientes en la mesa. El monitor se encargará de despertar al fumador correspondiente.",
                "semaphore"
            );
            updateControls();
            return;
        }

        placeIngredients(choosePair());
        return;
    }

    if (phase === "smokerReady") {
        phase = "smoking";
        phaseElapsed = 0;

        setSmokerState(activeSmoker, "Tomando ingredientes");
        setParticipant(
            smokers[activeSmoker].name,
            "Recogiendo los recursos disponibles"
        );

        logEvent(`${smokers[activeSmoker].name} recoge los ingredientes.`);

        setExplanation(
            "Acceso coordinado a la mesa",
            "El monitor permitió avanzar a un solo fumador. Los otros dos permanecen esperando para evitar conflictos sobre los recursos compartidos.",
            "critical"
        );

        updateControls();
        return;
    }

    if (phase === "smoking") {
        phase = "releasing";
        phaseElapsed = 0;

        setSmokerState(activeSmoker, "Fumando");
        setParticipant(smokers[activeSmoker].name, "Utilizando los ingredientes");

        logEvent(`${smokers[activeSmoker].name} está fumando.`);

        setExplanation(
            "El fumador está trabajando",
            "Durante esta etapa el agente debe esperar. La mesa sigue ocupada y no se admite otra pareja de ingredientes.",
            "concurrency"
        );

        updateControls();
        return;
    }

    if (phase === "releasing") {
        releaseTable();
    }
}

function resetSimulation() {
    stopTimer();

    running = false;
    paused = false;
    finished = false;

    phase = "waitingAgent";
    tableIngredients = [];
    activeSmoker = null;

    completed = 0;
    round = 1;
    contextChanges = 0;
    elapsedMs = 0;
    phaseElapsed = 0;

    smokerCounts = { 1: 0, 2: 0, 3: 0 };
    logStart = Date.now();

    ui.log.replaceChildren();
    ui.status.textContent = "Preparado";

    for (const id of [1, 2, 3]) {
        setSmokerState(id, "Esperando");
        setSemaphore(id, 0);
    }

    setSemaphore(0, 1);
    setAgentState("Esperando para colocar ingredientes", true);
    setParticipant("Agente", "Esperando instrucciones");

    renderTable();

    setExplanation(
        "La simulación está preparada",
        "Configura las rondas, la velocidad y el modo de ejecución. Puedes usar el agente automático o proporcionar manualmente la pareja de ingredientes.",
        "semaphore"
    );

    logEvent("Estado inicial restaurado.");

    updateStatistics();
    updateControls();
}

/* Eventos de los controles. */

ui.start.addEventListener("click", startSimulation);
ui.pause.addEventListener("click", pauseSimulation);
ui.reset.addEventListener("click", resetSimulation);

ui.step.addEventListener("click", () => {
    if (ui.executionMode.value !== "step") {
        logEvent("Selecciona el modo paso a paso en la configuración.");
        return;
    }

    if (!running || paused || finished) {
        return;
    }

    advanceStage();
});

ui.place.addEventListener("click", () => {
    placeIngredients(ui.pair.value.split(","));
});

ui.speed.addEventListener("input", () => {
    const milliseconds = Number(ui.speed.value);
    ui.speedValue.textContent =
        `${(milliseconds / 1000).toFixed(1)} segundos`;
});

ui.pair.addEventListener("change", updateMissingText);

ui.agentMode.addEventListener("change", () => {
    updateControls();

    if (ui.agentMode.value === "manual") {
        ui.agentStatus.textContent = "Esperando selección de ingredientes";
    } else {
        ui.agentStatus.textContent = "Selección automática activada";
    }
});

ui.executionMode.addEventListener("change", () => {
    phaseElapsed = 0;
    updateControls();

    logEvent(
        ui.executionMode.value === "step"
            ? "Modo paso a paso seleccionado."
            : "Modo automático seleccionado."
    );
});

ui.roundLimit.addEventListener("change", () => {
    updateStatistics();

    if (running && limit() !== 0 && completed >= limit()) {
        finishSimulation();
    }
});

ui.selectionMode.addEventListener("change", () => {
    logEvent(
        ui.selectionMode.value === "turns"
            ? "El agente automático usará una distribución por turnos."
            : "El agente automático elegirá las parejas aleatoriamente."
    );
});

$("btnClearLog").addEventListener("click", () => {
    ui.log.replaceChildren();
    logEvent("Registro de eventos limpiado.");
});

document.querySelectorAll(".concept-button").forEach(button => {
    button.addEventListener("click", () => {
        selectConcept(button.dataset.concept);
    });
});

/* Inicialización. */

selectConcept(selectedConcept);
updateMissingText();

ui.speedValue.textContent =
    `${(Number(ui.speed.value) / 1000).toFixed(1)} segundos`;

renderTable();
updateStatistics();
updateControls();

logEvent("Monitor inicializado. No hay ingredientes en la mesa.");