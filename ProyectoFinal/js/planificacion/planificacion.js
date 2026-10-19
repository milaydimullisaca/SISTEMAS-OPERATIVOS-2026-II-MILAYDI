(() => {
    "use strict";

    /* ============================================================
       CONSTANTES
       ============================================================ */
    const ROW_H = 32;          // alto de cada fila del Gantt
    const OFFSET = 76;         // ancho de la columna de nombres del Gantt
    const MAXQ = 10;           // procesos que se muestran por columna en la cola
    const MAX_TICKS = 200000;  // límite de seguridad del simulador

    const algorithmNames = {
        FCFS: "FCFS — Primero en llegar",
        SPN: "SPN — Proceso más corto",
        SRT: "SRT — Menor tiempo restante",
        RR: "Round Robin"
    };

    /* ============================================================
       UTILIDADES
       ============================================================ */
    const $ = id => document.getElementById(id);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const hue = i => Math.round((i * 137.508) % 360);
    const colorFill = i => `hsl(${hue(i)} 85% 85%)`;
    const colorStroke = i => `hsl(${hue(i)} 55% 62%)`;

    function td(value, className) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        if (className) cell.className = className;
        return cell;
    }

    /* ============================================================
       SIMULADOR (un paso = 1 unidad de tiempo)
       ============================================================ */
    function simulate(processes, algorithm, quantum) {
        const n = processes.length;

        const P = processes.map((p, i) => ({
            i,
            arrival: p.arrival,
            burst: p.burst,
            order: p.order,
            remaining: p.burst
        }));

        const byArrival = [...P].sort(
            (a, b) => a.arrival - b.arrival || a.order - b.order
        );

        const base = (a, b) => a.arrival - b.arrival || a.order - b.order;

        const cmp =
            algorithm === "SPN" ? (a, b) => a.burst - b.burst || base(a, b) :
            algorithm === "SRT" ? (a, b) => a.remaining - b.remaining || base(a, b) :
            base;

        // inserción ordenada (después de los iguales)
        const insert = (list, p) => {
            let lo = 0, hi = list.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cmp(list[mid], p) <= 0) lo = mid + 1;
                else hi = mid;
            }
            list.splice(lo, 0, p);
        };

        const ready = [];
        let current = null;
        let quantumLeft = 0;
        let expired = false;
        let ap = 0;
        let t = 0;
        let finished = 0;

        const segments = [];
        const snapRun = [];
        const snapQ = [];
        const snapN = [];
        const firstStart = new Array(n).fill(-1);
        const completion = new Array(n).fill(0);

        while (finished < n) {
            if (t > MAX_TICKS) {
                throw new Error(
                    `La simulación supera ${MAX_TICKS.toLocaleString("es-PE")} unidades de tiempo. Reduce los tiempos de llegada o ejecución.`
                );
            }

            // 1) llegadas
            while (ap < n && byArrival[ap].arrival <= t) {
                if (algorithm === "RR") ready.push(byArrival[ap]);
                else insert(ready, byArrival[ap]);
                ap++;
            }

            // 2) selección del proceso en CPU
            if (algorithm === "RR") {
                if (expired && current) {
                    ready.push(current);
                    current = null;
                    expired = false;
                }
                if (!current && ready.length) {
                    current = ready.shift();
                    quantumLeft = quantum;
                }
            } else if (algorithm === "SRT") {
                current = ready.length ? ready[0] : null;
            } else if (!current && ready.length) {
                current = ready.shift();
            }

            // 3) foto de la cola en este instante
            const q = [];
            let total = 0;

            if (algorithm === "SRT") {
                for (let k = 0; k < ready.length && k < MAXQ; k++) q.push(ready[k].i);
                total = ready.length;
            } else if (current) {
                q.push(current.i);
                for (let k = 0; k < ready.length && q.length < MAXQ; k++) q.push(ready[k].i);
                total = ready.length + 1;
            }

            snapRun.push(current ? current.i : -1);
            snapQ.push(q);
            snapN.push(total);

            // 4) CPU ociosa
            if (!current) {
                t++;
                continue;
            }

            // 5) ejecutar una unidad
            if (firstStart[current.i] < 0) firstStart[current.i] = t;

            const last = segments[segments.length - 1];
            if (last && last.p === current.i && last.end === t) last.end = t + 1;
            else segments.push({ p: current.i, start: t, end: t + 1 });

            current.remaining--;
            t++;

            if (current.remaining === 0) {
                completion[current.i] = t;
                finished++;
                if (algorithm === "SRT") ready.shift();
                current = null;
                quantumLeft = 0;
            } else if (algorithm === "RR") {
                quantumLeft--;
                if (quantumLeft === 0) expired = true;
            }
        }

        const rows = P.map(p => {
            const finish = completion[p.i];
            const turnaround = finish - p.arrival;
            return {
                finish,
                turnaround,
                waiting: turnaround - p.burst,
                response: firstStart[p.i] - p.arrival
            };
        });

        const finishOrder = P.map(p => p.i).sort(
            (a, b) => rows[a].finish - rows[b].finish || a - b
        );

        const avg = key => rows.reduce((s, r) => s + r[key], 0) / rows.length;

        return {
            algorithm,
            segments,
            snapRun,
            snapQ,
            snapN,
            rows,
            finishOrder,
            totalTime: t,
            averageWaiting: avg("waiting"),
            averageTurnaround: avg("turnaround"),
            averageResponse: avg("response")
        };
    }

    /* ============================================================
       LECTURA DE ARCHIVOS TXT
       Formatos aceptados (separados por espacio, coma, ; o tab):
         llegada ejecucion
         nombre llegada ejecucion
         n° nombre llegada ejecucion [retorno espera]
       ============================================================ */
    function parseProcesses(text) {
        const procs = [];
        const errors = [];
        const names = new Set();
        let firstLine = true;

        text.split(/\r?\n/).forEach((raw, idx) => {
            const line = raw.trim();
            if (!line || line.startsWith("#") || line.startsWith("//")) return;

            const parts = line.split(/[\s,;|]+/).filter(Boolean);
            let name, arrival, burst;

            if (parts.length === 2) {
                [arrival, burst] = parts;
                name = `P${procs.length + 1}`;
            } else if (parts.length === 3) {
                [name, arrival, burst] = parts;
            } else if (parts.length >= 4) {
                [, name, arrival, burst] = parts;
            } else {
                errors.push(`Línea ${idx + 1}: faltan datos.`);
                firstLine = false;
                return;
            }

            const isInt = v => /^\d+$/.test(v);

            if (!isInt(arrival) || !isInt(burst)) {
                // la primera línea puede ser un encabezado
                if (!(firstLine && procs.length === 0)) {
                    errors.push(`Línea ${idx + 1}: la llegada y la ejecución deben ser enteros.`);
                }
                firstLine = false;
                return;
            }

            firstLine = false;

            const a = Number(arrival);
            const b = Number(burst);

            if (b < 1) {
                errors.push(`Línea ${idx + 1}: la ejecución debe ser mayor que cero.`);
                return;
            }

            name = name.slice(0, 12);

            if (names.has(name.toLowerCase())) {
                errors.push(`Línea ${idx + 1}: el nombre ${name} está repetido.`);
                return;
            }

            names.add(name.toLowerCase());
            procs.push({ name, arrival: a, burst: b });
        });

        return { procs, errors };
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { simulate, parseProcesses };
    }

    /* ============================================================
       INTERFAZ
       ============================================================ */
    function init() {
        if (!$("planningApp")) return;

        const st = {
            processes: [],
            nextOrder: 1,
            sim: null,
            unit: 40,
            t: 0,              // tiempo mostrado: se ejecutaron las unidades [0, t)
            segPtr: 0,
            finPtr: 0,
            done: 0,
            activeSeg: -1,
            activeRow: -1,
            qStart: 0,
            playing: false,
            raf: 0,
            last: 0,
            acc: 0,
            refs: { rows: [], ret: [], wait: [] },
            gantt: { segEls: [], rowEls: [], cursor: null, scroll: null }
        };

        /* ---------- mensajes ---------- */
        function showMessage(message, type = "") {
            const el = $("planningMessage");
            el.textContent = message;
            el.className = "planning-message" + (type ? " " + type : "");
        }

        /* ---------- tabla de procesos ---------- */
        function nextFreeName() {
            const used = new Set(st.processes.map(p => p.name.toLowerCase()));
            let k = st.processes.length + 1;
            while (used.has(`p${k}`)) k++;
            return `P${k}`;
        }

        function renderProcesses() {
            const body = $("processTableBody");
            body.replaceChildren();
            st.refs = { rows: [], ret: [], wait: [] };

            const count = st.processes.length;
            $("processCount").textContent =
                `${count.toLocaleString("es-PE")} proceso${count === 1 ? "" : "s"}`;

            if (!count) {
                const tr = document.createElement("tr");
                const cell = td("Todavía no hay procesos. Agrégalos o carga un archivo .txt.", "empty-cell");
                cell.colSpan = 7;
                tr.appendChild(cell);
                body.appendChild(tr);
                return;
            }

            const frag = document.createDocumentFragment();

            st.processes.forEach((p, i) => {
                const tr = document.createElement("tr");
                const ret = td("—", "pending-cell");
                const wait = td("—", "pending-cell");

                tr.append(td(i + 1), td(p.name), td(p.arrival), td(p.burst), ret, wait);

                const action = document.createElement("td");
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Eliminar";
                button.dataset.order = String(p.order);
                action.appendChild(button);
                tr.appendChild(action);

                frag.appendChild(tr);
                st.refs.rows.push(tr);
                st.refs.ret.push(ret);
                st.refs.wait.push(wait);
            });

            body.appendChild(frag);
        }

        function resetTableCells() {
            st.refs.rows.forEach((tr, i) => {
                tr.classList.remove("running", "finished");
                st.refs.ret[i].textContent = "—";
                st.refs.wait[i].textContent = "—";
                st.refs.ret[i].classList.add("pending-cell");
                st.refs.wait[i].classList.add("pending-cell");
            });
        }

        $("processTableBody").addEventListener("click", event => {
            const button = event.target.closest("button[data-order]");
            if (!button) return;

            const order = Number(button.dataset.order);
            const removed = st.processes.find(p => p.order === order);

            st.processes = st.processes.filter(p => p.order !== order);
            clearResults();
            renderProcesses();
            $("processName").value = nextFreeName();

            if (removed) showMessage(`Se eliminó el proceso ${removed.name}.`);
        });

        /* ---------- alta manual ---------- */
        function addProcess() {
            const name = $("processName").value.trim();
            const arrivalRaw = $("arrivalTime").value.trim();
            const burstRaw = $("burstTime").value.trim();
            const arrival = Number(arrivalRaw);
            const burst = Number(burstRaw);

            if (!name) {
                showMessage("Ingresa el nombre del proceso.", "error");
                return;
            }

            if (st.processes.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                showMessage("Ya existe un proceso con ese nombre.", "error");
                return;
            }

            if (
                arrivalRaw === "" || burstRaw === "" ||
                !Number.isSafeInteger(arrival) || !Number.isSafeInteger(burst) ||
                arrival < 0 || burst < 1
            ) {
                showMessage(
                    "La llegada debe ser un entero mayor o igual a cero y la ejecución un entero positivo.",
                    "error"
                );
                return;
            }

            st.processes.push({ name, arrival, burst, order: st.nextOrder++ });

            clearResults();
            renderProcesses();

            $("processName").value = nextFreeName();
            $("processName").focus();
            $("processName").select();

            showMessage(`Proceso ${name} agregado correctamente.`, "success");
        }

        $("addProcess").addEventListener("click", addProcess);

        ["processName", "arrivalTime", "burstTime"].forEach(id => {
            $(id).addEventListener("keydown", event => {
                if (event.key === "Enter") addProcess();
            });
        });

        $("clearProcesses").addEventListener("click", () => {
            st.processes = [];
            st.nextOrder = 1;
            clearResults();
            renderProcesses();
            $("processName").value = "P1";
            showMessage("Se eliminaron todos los procesos.");
        });

        /* ---------- archivo TXT ---------- */
        function loadProcesses(list, sourceText) {
            st.processes = list.map((p, i) => ({ ...p, order: i + 1 }));
            st.nextOrder = list.length + 1;

            clearResults();
            renderProcesses();
            $("processName").value = nextFreeName();

            showMessage(sourceText, "success");
        }

        async function importFile(file) {
            try {
                const text = await file.text();
                const { procs, errors } = parseProcesses(text);

                if (!procs.length) {
                    showMessage(
                        "No se encontró ningún proceso válido en el archivo. " +
                        (errors[0] || "Usa el formato: nombre llegada ejecución."),
                        "error"
                    );
                    return;
                }

                let message =
                    `Se cargaron ${procs.length.toLocaleString("es-PE")} procesos desde ${file.name}.`;

                if (errors.length) {
                    message +=
                        ` Se ignoraron ${errors.length} línea(s). ` +
                        errors.slice(0, 3).join(" ");
                }

                loadProcesses(procs, message);
                if (errors.length) $("planningMessage").classList.replace("success", "error");
            } catch (error) {
                showMessage("No se pudo leer el archivo.", "error");
            }
        }

        $("loadFileButton").addEventListener("click", () => $("fileInput").click());

        $("fileInput").addEventListener("change", async event => {
            const file = event.target.files[0];
            if (file) await importFile(file);
            event.target.value = "";
        });

        const box = $("importBox");

        ["dragenter", "dragover"].forEach(name =>
            box.addEventListener(name, event => {
                event.preventDefault();
                box.classList.add("dragover");
            })
        );

        ["dragleave", "drop"].forEach(name =>
            box.addEventListener(name, event => {
                event.preventDefault();
                box.classList.remove("dragover");
            })
        );

        box.addEventListener("drop", async event => {
            const file = event.dataTransfer.files[0];
            if (file) await importFile(file);
        });

        $("downloadExample").addEventListener("click", () => {
            const text = [
                "# nombre  llegada  ejecucion",
                "P1 0 4",
                "P2 1 3",
                "P3 2 6",
                "P4 3 2",
                "P5 8 5",
                ""
            ].join("\n");

            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "procesos_ejemplo.txt";
            link.click();
            URL.revokeObjectURL(url);
        });

        $("generateRandom").addEventListener("click", () => {
            const count = Math.floor(Number($("randomCount").value));

            if (!Number.isFinite(count) || count < 1 || count > 5000) {
                showMessage("Indica una cantidad entre 1 y 5000.", "error");
                return;
            }

            const list = Array.from({ length: count }, () => ({
                arrival: Math.floor(Math.random() * count * 2),
                burst: 1 + Math.floor(Math.random() * 8)
            }))
                .sort((a, b) => a.arrival - b.arrival)
                .map((p, i) => ({ name: `P${i + 1}`, ...p }));

            loadProcesses(list, `Se generaron ${count.toLocaleString("es-PE")} procesos aleatorios.`);
        });

        /* ---------- resultados ---------- */
        function clearResults() {
            pause();

            st.sim = null;
            st.t = 0;
            st.segPtr = 0;
            st.finPtr = 0;
            st.done = 0;
            st.activeSeg = -1;
            st.activeRow = -1;
            st.qStart = 0;
            st.gantt = { segEls: [], rowEls: [], cursor: null, scroll: null };

            resetTableCells();

            $("ganttChart").innerHTML =
                '<p class="empty-state">Ejecuta o reproduce una simulación para ver el diagrama.</p>';
            $("readyQueue").innerHTML =
                '<p class="empty-state">La cola de listos aparecerá al simular.</p>';
            $("queueNav").hidden = true;

            ["averageWaiting", "averageTurnaround", "averageResponse", "totalTime"]
                .forEach(id => { $(id).textContent = "—"; });

            const scrub = $("simScrub");
            scrub.max = "0";
            scrub.value = "0";
            scrub.disabled = true;

            $("simTime").textContent = "—";
            $("simCpu").textContent = "—";
            $("simQueueCount").textContent = "—";
            $("simDone").textContent = "—";

            syncPlayButton();
        }

        /* ---------- Gantt ---------- */
        function fitUnit(total) {
            return clamp(Math.floor(860 / Math.max(total, 1)), 3, 40);
        }

        function tickStep(unit) {
            const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
            return nice.find(s => s * unit >= 36) || 10000;
        }

        function setSeg(el, width) {
            el.style.width = `${width}px`;
            el.style.display = width > 0 ? "flex" : "none";
        }

        function buildGantt() {
            const host = $("ganttChart");
            host.replaceChildren();

            const sim = st.sim;
            const unit = st.unit;
            const total = sim.totalTime;
            const width = total * unit;
            const step = tickStep(unit);

            const scroll = document.createElement("div");
            scroll.className = "gantt-scroll";

            const inner = document.createElement("div");
            inner.className = "gantt-inner";
            inner.style.width = `${OFFSET + width + 28}px`;

            const grid = document.createElement("div");
            grid.className = "g-grid";
            grid.style.left = `${OFFSET}px`;
            grid.style.width = `${width}px`;
            grid.style.setProperty("--gs", `${step * unit}px`);
            inner.appendChild(grid);

            const tracks = [];
            const rowEls = [];

            st.processes.forEach((p, i) => {
                const row = document.createElement("div");
                row.className = "g-row";

                const label = document.createElement("div");
                label.className = "g-label";
                label.textContent = p.name;
                label.title = p.name;

                const track = document.createElement("div");
                track.className = "g-track";
                track.style.width = `${width}px`;

                row.append(label, track);
                inner.appendChild(row);
                tracks.push(track);
                rowEls.push(row);
            });

            const segEls = sim.segments.map(s => {
                const name = st.processes[s.p].name;
                const el = document.createElement("div");

                el.className = "g-seg";
                el.style.left = `${s.start * unit}px`;
                el.style.background = colorFill(s.p);
                el.style.borderColor = colorStroke(s.p);
                el.style.display = "none";
                el.title = `${name}: ${s.start} → ${s.end}`;
                el.textContent = name;

                tracks[s.p].appendChild(el);
                return el;
            });

            // eje de tiempo
            const axis = document.createElement("div");
            axis.className = "g-axis";

            const axisLabel = document.createElement("div");
            axisLabel.className = "g-label";

            const axisTrack = document.createElement("div");
            axisTrack.className = "g-axis-track";
            axisTrack.style.width = `${width}px`;

            const addTick = k => {
                const tick = document.createElement("span");
                tick.className = "g-tick";
                tick.style.left = `${k * unit}px`;
                tick.textContent = String(k);
                axisTrack.appendChild(tick);
            };

            let lastTick = 0;
            for (let k = 0; k <= total; k += step) {
                addTick(k);
                lastTick = k;
            }
            if (lastTick !== total && (total - lastTick) * unit >= 36) addTick(total);

            axis.append(axisLabel, axisTrack);
            inner.appendChild(axis);

            const cursor = document.createElement("div");
            cursor.className = "g-cursor";
            inner.appendChild(cursor);

            scroll.appendChild(inner);
            host.appendChild(scroll);

            st.gantt = { segEls, rowEls, cursor, scroll };
            st.activeSeg = -1;

            $("zoomLabel").textContent = `${unit} px/u`;
        }

        /* ---------- avance / retroceso de la simulación ---------- */
        function resetView() {
            const g = st.gantt;

            g.segEls.forEach(el => {
                el.classList.remove("active");
                setSeg(el, 0);
            });

            if (st.activeRow >= 0) {
                g.rowEls[st.activeRow]?.classList.remove("active");
                st.refs.rows[st.activeRow]?.classList.remove("running");
            }

            resetTableCells();

            st.segPtr = 0;
            st.finPtr = 0;
            st.done = 0;
            st.activeSeg = -1;
            st.activeRow = -1;
            st.t = 0;

            if (g.cursor) g.cursor.style.left = `${OFFSET}px`;
        }

        function advance(t) {
            const { segments, rows, finishOrder } = st.sim;
            const g = st.gantt;

            while (st.segPtr < segments.length && segments[st.segPtr].start < t) {
                const s = segments[st.segPtr];
                setSeg(g.segEls[st.segPtr], (Math.min(s.end, t) - s.start) * st.unit);
                if (s.end <= t) st.segPtr++;
                else break;
            }

            while (st.finPtr < finishOrder.length && rows[finishOrder[st.finPtr]].finish <= t) {
                const i = finishOrder[st.finPtr++];

                st.refs.ret[i].textContent = rows[i].turnaround;
                st.refs.wait[i].textContent = rows[i].waiting;
                st.refs.ret[i].classList.remove("pending-cell");
                st.refs.wait[i].classList.remove("pending-cell");
                st.refs.rows[i].classList.add("finished");
                st.done++;
            }
        }

        function updateGanttView(t, follow) {
            const sim = st.sim;
            const g = st.gantt;
            const total = sim.totalTime;
            const segs = sim.segments;

            g.cursor.style.left = `${OFFSET + t * st.unit}px`;

            // barra activa
            let k = -1;
            if (t > 0 && t < total) {
                const cand =
                    st.segPtr < segs.length && segs[st.segPtr].start < t
                        ? st.segPtr
                        : st.segPtr - 1;

                if (cand >= 0 && segs[cand].start < t && segs[cand].end >= t) k = cand;
            }

            if (k !== st.activeSeg) {
                if (st.activeSeg >= 0) g.segEls[st.activeSeg]?.classList.remove("active");
                if (k >= 0) g.segEls[k].classList.add("active");
                st.activeSeg = k;
            }

            // fila activa
            const run = t > 0 && t < total ? sim.snapRun[t - 1] : -1;

            if (run !== st.activeRow) {
                if (st.activeRow >= 0) {
                    g.rowEls[st.activeRow]?.classList.remove("active");
                    st.refs.rows[st.activeRow]?.classList.remove("running");
                }
                if (run >= 0) {
                    g.rowEls[run].classList.add("active");
                    st.refs.rows[run].classList.add("running");
                }
                st.activeRow = run;
            }

            if (follow) {
                const sc = g.scroll;
                const x = OFFSET + t * st.unit;

                if (x < sc.scrollLeft + OFFSET + 10 || x > sc.scrollLeft + sc.clientWidth - 40) {
                    sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.6);
                }

                if (run >= 0) {
                    const top = 10 + run * ROW_H;
                    if (top < sc.scrollTop || top + ROW_H > sc.scrollTop + sc.clientHeight - 34) {
                        sc.scrollTop = Math.max(0, top - sc.clientHeight / 2);
                    }
                }
            }
        }

        /* ---------- cola de listos ---------- */
        function queueWidth() {
            const host = $("readyQueue");
            return Math.max(5, Math.floor((host.clientWidth - 150) / 56)) || 10;
        }

        function renderQueue(follow) {
            const sim = st.sim;
            if (!sim) return;

            const host = $("readyQueue");
            const total = sim.totalTime;
            const t = st.t;
            const W = queueWidth();

            if (follow) {
                const col = Math.max(0, t - 1);
                if (t === 0 || col < st.qStart || col >= st.qStart + W) {
                    st.qStart = Math.floor(col / W) * W;
                }
            }

            st.qStart = clamp(st.qStart, 0, Math.max(0, (Math.ceil(total / W) - 1) * W));

            const start = st.qStart;
            const end = Math.min(start + W, total);
            const cols = [];
            let depth = 1;

            for (let x = start; x < end; x++) {
                const list = sim.snapQ[x].map(i => ({ i, name: st.processes[i].name }));
                const extra = sim.snapN[x] - list.length;
                if (extra > 0) list.push({ more: extra });
                cols.push(list);
                depth = Math.max(depth, list.length);
            }

            const table = document.createElement("table");
            table.className = "queue-table";

            for (let r = 0; r < depth; r++) {
                const tr = document.createElement("tr");
                tr.appendChild(td(r === 0 ? "Cola ↓" : "", "q-label"));

                cols.forEach((list, c) => {
                    const x = start + c;
                    const cell = td("");
                    const future = x >= t;

                    if (x === t - 1) cell.classList.add("q-cur");

                    if (!future) {
                        const item = list[r];

                        if (item && item.more) {
                            cell.textContent = `+${item.more}`;
                            cell.classList.add("q-more");
                        } else if (item) {
                            const span = document.createElement("span");
                            span.textContent = item.name;

                            if (r === 0) {
                                span.className = "q-chip";
                                span.style.background = colorFill(item.i);
                                span.style.borderColor = colorStroke(item.i);
                            }

                            cell.appendChild(span);
                        } else if (r === 0 && !list.length) {
                            cell.textContent = "—";
                            cell.classList.add("q-more");
                        }
                    }

                    tr.appendChild(cell);
                });

                table.appendChild(tr);
            }

            const timeRow = document.createElement("tr");
            timeRow.className = "q-time";
            timeRow.appendChild(td("Tiempo t:", "q-label"));

            for (let x = start; x < end; x++) {
                const cell = td(x);
                if (x === t - 1) cell.classList.add("q-cur");
                if (x >= t) cell.classList.add("q-future");
                timeRow.appendChild(cell);
            }

            table.appendChild(timeRow);
            host.replaceChildren(table);

            $("queueNav").hidden = false;
            $("queueInfo").textContent =
                `Instantes ${start} a ${Math.max(start, end - 1)} de ${total - 1}`;
            $("queuePrev").disabled = start <= 0;
            $("queueNext").disabled = start + W >= total;
        }

        $("queuePrev").addEventListener("click", () => {
            st.qStart = Math.max(0, st.qStart - queueWidth());
            renderQueue(false);
        });

        $("queueNext").addEventListener("click", () => {
            st.qStart += queueWidth();
            renderQueue(false);
        });

        /* ---------- estado y métricas ---------- */
        function syncPlayButton() {
            const button = $("simPlay");
            const sim = st.sim;

            if (st.playing) button.textContent = "⏸ Pausar";
            else if (sim && st.t > 0 && st.t < sim.totalTime) button.textContent = "▶ Continuar";
            else button.textContent = "▶ Reproducir";
        }

        function updateStatus() {
            const sim = st.sim;
            const t = st.t;
            const total = sim.totalTime;
            const executing = t > 0 && t < total;

            $("simTime").textContent = `${t} / ${total}`;

            if (executing) {
                const run = sim.snapRun[t - 1];
                $("simCpu").textContent = run >= 0 ? st.processes[run].name : "Ociosa";
                $("simQueueCount").textContent = String(Math.max(0, sim.snapN[t - 1] - (run >= 0 ? 1 : 0)));
            } else {
                $("simCpu").textContent = "—";
                $("simQueueCount").textContent = "0";
            }

            $("simDone").textContent =
                `${st.done.toLocaleString("es-PE")} / ${st.processes.length.toLocaleString("es-PE")}`;

            $("simScrub").value = String(t);

            if (t >= total) {
                $("averageWaiting").textContent = sim.averageWaiting.toFixed(2);
                $("averageTurnaround").textContent = sim.averageTurnaround.toFixed(2);
                $("averageResponse").textContent = sim.averageResponse.toFixed(2);
                $("totalTime").textContent = String(total);
            } else {
                ["averageWaiting", "averageTurnaround", "averageResponse", "totalTime"]
                    .forEach(id => { $(id).textContent = "—"; });
            }

            syncPlayButton();
        }

        function seek(target, follow) {
            const sim = st.sim;
            if (!sim) return;

            const t = clamp(Math.round(target), 0, sim.totalTime);

            if (t < st.t) resetView();

            advance(t);
            st.t = t;

            updateGanttView(t, follow);
            renderQueue(follow);
            updateStatus();
        }

        /* ---------- reproducción ---------- */
        function loop(ts) {
            if (!st.playing) return;

            const dt = Math.min(250, ts - st.last);
            st.last = ts;
            st.acc += (dt / 1000) * Number($("simSpeed").value);

            const steps = Math.floor(st.acc);

            if (steps >= 1) {
                st.acc -= steps;
                seek(st.t + steps, true);

                if (st.t >= st.sim.totalTime) {
                    pause();
                    showMessage("Simulación terminada.", "success");
                    return;
                }
            }

            st.raf = requestAnimationFrame(loop);
        }

        function play() {
            st.playing = true;
            st.last = performance.now();
            st.acc = 0;
            syncPlayButton();
            st.raf = requestAnimationFrame(loop);
        }

        function pause() {
            st.playing = false;
            cancelAnimationFrame(st.raf);
            syncPlayButton();
        }

        function compute() {
            if (!st.processes.length) {
                showMessage("Agrega al menos un proceso antes de simular.", "error");
                return false;
            }

            const algorithm = $("algorithm").value;
            const quantum = Number($("quantum").value);

            if (
                algorithm === "RR" &&
                ($("quantum").value.trim() === "" || !Number.isSafeInteger(quantum) || quantum < 1)
            ) {
                showMessage("El quantum debe ser un entero positivo.", "error");
                return false;
            }

            let sim;

            try {
                sim = simulate(st.processes, algorithm, quantum);
            } catch (error) {
                showMessage(error.message, "error");
                return false;
            }

            pause();

            st.sim = sim;
            st.unit = fitUnit(sim.totalTime);
            st.qStart = 0;

            buildGantt();
            resetView();

            const scrub = $("simScrub");
            scrub.max = String(sim.totalTime);
            scrub.value = "0";
            scrub.disabled = false;

            return true;
        }

        $("runPlanning").addEventListener("click", () => {
            if (!compute()) return;

            seek(st.sim.totalTime, false);

            showMessage(
                `${algorithmNames[st.sim.algorithm]} ejecutado. ` +
                `Se procesaron ${st.processes.length.toLocaleString("es-PE")} procesos en ${st.sim.totalTime} unidades de tiempo.`,
                "success"
            );
        });

        $("simPlay").addEventListener("click", () => {
            if (st.playing) {
                pause();
                return;
            }

            if (!st.sim && !compute()) return;

            if (st.t >= st.sim.totalTime) {
                resetView();
                seek(0, true);
            }

            showMessage("Simulando… cada barra crece mientras el proceso usa la CPU.");
            play();
        });

        $("simStep").addEventListener("click", () => {
            if (!st.sim && !compute()) return;
            pause();
            seek(st.t + 1, true);
        });

        $("simBack").addEventListener("click", () => {
            if (!st.sim) return;
            pause();
            seek(st.t - 1, true);
        });

        $("simReset").addEventListener("click", () => {
            if (!st.sim) return;
            pause();
            resetView();
            seek(0, true);
            st.gantt.scroll.scrollTo(0, 0);
        });

        $("simScrub").addEventListener("input", event => {
            if (!st.sim) return;
            pause();
            seek(Number(event.target.value), true);
        });

        $("simSpeed").addEventListener("input", () => {
            $("simSpeedLabel").textContent = `${$("simSpeed").value} u/s`;
        });

        /* ---------- zoom del Gantt ---------- */
        function setZoom(unit) {
            if (!st.sim) return;

            const t = st.t;
            st.unit = clamp(unit, 2, 80);

            buildGantt();
            resetView();
            seek(t, false);
        }

        $("zoomIn").addEventListener("click", () =>
            setZoom(Math.max(st.unit + 1, Math.round(st.unit * 1.4))));

        $("zoomOut").addEventListener("click", () =>
            setZoom(Math.min(st.unit - 1, Math.round(st.unit / 1.4))));

        $("zoomFit").addEventListener("click", () => {
            if (st.sim) setZoom(fitUnit(st.sim.totalTime));
        });

        window.addEventListener("resize", () => {
            if (st.sim) renderQueue(false);
        });

        /* ---------- configuración ---------- */
        function syncQuantum() {
            $("quantum").disabled = $("algorithm").value !== "RR";
        }

        $("algorithm").addEventListener("change", () => {
            syncQuantum();
            clearResults();
        });

        $("quantum").addEventListener("input", () => {
            if ($("algorithm").value === "RR") clearResults();
        });

        syncQuantum();
        $("processName").value = "P1";
        $("simSpeedLabel").textContent = `${$("simSpeed").value} u/s`;

        renderProcesses();
        clearResults();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();