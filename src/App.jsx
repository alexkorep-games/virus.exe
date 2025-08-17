import { useEffect } from 'react';

const HTML_CONTENT = `
    <header>
      <div class="logo glitch" data-text="VIRUS.EXE">VIRUS.EXE</div>
      <div class="panel">
        <div class="stat" title="Moves used">🦠 Moves: <b id="moves">0</b></div>
        <div class="stat" title="Infected cells">
          Spread: <b id="spread">0%</b>
        </div>
        <div class="stat" title="Elapsed time">⏱ <b id="timer">00:00</b></div>
        <div class="stat" title="Progress">
          <div class="bar"><i id="bar"></i></div>
        </div>
      </div>
    </header>

    <main>
      <div class="wrap">
        <section class="card">
          <h3>Mission: Contaminate the Grid</h3>
          <p class="hint">
            You are a rogue process. Start from the <b>top‑left node</b>. Each
            turn choose a virus strain (color). The infected region mutates into
            that strain and spreads to any adjacent nodes of the same strain.
            Infect the entire chipset in the fewest moves.
          </p>

          <div class="controls" style="margin-top: 10px">
            <div class="row">
              <label
                >Grid
                <select id="size">
                  <option value="10">10×10</option>
                  <option value="14" selected>14×14</option>
                  <option value="18">18×18</option>
                  <option value="22">22×22</option>
                </select>
              </label>
              <label
                >Strains
                <select id="colors">
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6" selected>6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                </select>
              </label>
            </div>
            <div class="row">
              <label style="flex: 1"
                >Seed
                <input id="seed" placeholder="random" />
              </label>
            </div>
            <div class="row">
              <button id="new" class="primary">New Game</button>
              <button id="undo">Undo</button>
              <button id="hint">Hint</button>
              <button
                id="resetBest"
                class="danger"
                title="Forget saved best for this setup"
              >
                Reset Best
              </button>
            </div>
            <div class="row">
              <div class="hint">
                Hotkeys: <b>1…8</b> select strains • Click any cell to pick its
                color • Best for this setup: <b id="best">—</b>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 12px">
            <h3>Strains</h3>
            <div id="palette" class="palette" aria-label="virus palette"></div>
          </div>

          <div class="footer" style="margin-top: 14px">
            <span
              >Theme: cyber‑infection • Built in a single HTML file • No
              trackers, no external assets.</span
            >
          </div>
        </section>

        <section class="card">
          <h3>Chipset</h3>
          <div
            id="board"
            class="board"
            role="grid"
            aria-label="game board"
          ></div>
        </section>
      </div>
    </main>

    <div id="overlay" class="overlay" aria-hidden="true">
      <div class="modal">
        <h2>SYSTEM BREACH COMPLETE</h2>
        <p id="summary">You infected everything.</p>
        <div class="actions">
          <button id="again" class="primary">Play Again</button>
          <button id="close">Close</button>
        </div>
      </div>
    </div>

`;

export default function App() {
  useEffect(() => {
      // ====== Utilities ======
      function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
      }
      function pad(n) {
        return String(n).padStart(2, "0");
      }
      function now() {
        return new Date().getTime();
      }
      function strHash(s) {
        // Simple 32-bit FNV-1a
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h =
            (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h >>> 0;
      }
      function rngFrom(seed) {
        // Mulberry32
        let t = seed >>> 0;
        if (t === 0) t = 0xdeadbeef;
        return function () {
          t += 0x6d2b79f5;
          let r = Math.imul(t ^ (t >>> 15), 1 | t);
          r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
      }

      // ====== Game State ======
      const BoardEl = document.getElementById("board");
      const PaletteEl = document.getElementById("palette");
      const MovesEl = document.getElementById("moves");
      const SpreadEl = document.getElementById("spread");
      const TimerEl = document.getElementById("timer");
      const BarEl = document.getElementById("bar");
      const BestEl = document.getElementById("best");
      const Overlay = document.getElementById("overlay");
      const SummaryEl = document.getElementById("summary");

      const SizeSel = document.getElementById("size");
      const ColorsSel = document.getElementById("colors");
      const SeedInput = document.getElementById("seed");
      const NewBtn = document.getElementById("new");
      const UndoBtn = document.getElementById("undo");
      const HintBtn = document.getElementById("hint");
      const ResetBestBtn = document.getElementById("resetBest");
      const AgainBtn = document.getElementById("again");
      const CloseBtn = document.getElementById("close");

      const MAX_COLORS = 8;
      const COLOR_CLASSES = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];

      let W = 14,
        H = 14,
        COLORS = 6;
      let board = []; // 1D array length W*H holding color indices
      let cells = []; // DOM nodes parallel to board
      let currentColor = 0;
      let moves = 0;
      let infectedCount = 0;
      let startTime = 0,
        timerId = null;
      let rng = rngFrom((Math.random() * 1e9) | 0);
      let undoStack = [];
      let seedUsed = "";

      function keyBestKey() {
        return `virusFlood:best:${W}x${H}:${COLORS}:${seedUsed}`;
      }
      function loadBest() {
        const v = localStorage.getItem(keyBestKey());
        return v ? parseInt(v, 10) : null;
      }
      function saveBest(n) {
        const k = keyBestKey();
        const old = loadBest();
        if (old == null || n < old) {
          localStorage.setItem(k, String(n));
        }
      }
      function updateBestLabel() {
        const b = loadBest();
        BestEl.textContent = b == null ? "—" : b;
      }

      function idx(x, y) {
        return y * W + x;
      }
      function inb(x, y) {
        return x >= 0 && y >= 0 && x < W && y < H;
      }

      function makeBoard() {
        BoardEl.style.setProperty("--gap", "4px");
        BoardEl.style.gridTemplateColumns = `repeat(${W}, var(--cell-size))`;
        BoardEl.innerHTML = "";
        cells = [];
        const frag = document.createDocumentFragment();
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const d = document.createElement("div");
            d.className = "cell";
            d.setAttribute("role", "button");
            d.setAttribute("aria-label", `cell ${x + 1},${y + 1}`);
            d.addEventListener("click", () => chooseColor(board[idx(x, y)]));
            frag.appendChild(d);
            cells.push(d);
          }
        }
        BoardEl.appendChild(frag);
      }

      function randomize() {
        board = new Array(W * H);
        for (let i = 0; i < board.length; i++) board[i] = (rng() * COLORS) | 0;
        currentColor = board[0];
      }

      function renderAll() {
        for (let i = 0; i < board.length; i++) {
          const c = board[i];
          const el = cells[i];
          COLOR_CLASSES.forEach((cc) => el.classList.remove(cc));
          el.classList.add(COLOR_CLASSES[c]);
          el.classList.toggle("infected", false);
        }
        markInfected();
        updatePalette();
        updateHud();
      }

      function markInfected() {
        // BFS from (0,0) for currentColor to count infected
        const qx = [0],
          qy = [0];
        const seen = new Uint8Array(W * H);
        seen[0] = 1;
        const target = currentColor;
        let count = 0;
        while (qx.length) {
          const x = qx.pop(),
            y = qy.pop();
          const i = idx(x, y);
          const col = board[i];
          if (col !== target) continue;
          count++;
          cells[i].classList.add("infected");
          const nbs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of nbs) {
            const nx = x + dx,
              ny = y + dy;
            if (!inb(nx, ny)) continue;
            const j = idx(nx, ny);
            if (seen[j]) continue;
            seen[j] = 1;
            qx.push(nx);
            qy.push(ny);
          }
        }
        infectedCount = count;
        const pct = Math.round((100 * infectedCount) / (W * H));
        SpreadEl.textContent = pct + "%";
        BarEl.style.width = pct + "%";
      }

      function updateHud() {
        MovesEl.textContent = moves;
      }

      function ensureTimer() {
        if (timerId) return;
        startTime = now();
        timerId = setInterval(() => {
          const t = Math.floor((now() - startTime) / 1000);
          const mm = pad((t / 60) | 0),
            ss = pad(t % 60);
          TimerEl.textContent = `${mm}:${ss}`;
        }, 300);
      }

      function stopTimer() {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
      }

      function chooseColor(c) {
        if (c === currentColor) return;
        // Save for undo
        undoStack.push({ board: board.slice(), currentColor, moves });

        ensureTimer();

        // 1) Flood-grow from origin: allow traversal through target OR selected color
        const target = currentColor;
        const selected = c;
        const q = [[0, 0]];
        const seen = new Uint8Array(W * H);
        seen[0] = 1;
        while (q.length) {
          const [x, y] = q.pop();
          const i = idx(x, y);
          const col = board[i];
          if (col !== target && col !== selected) continue;
          board[i] = selected; // recolor
          const nbs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of nbs) {
            const nx = x + dx,
              ny = y + dy;
            if (!inb(nx, ny)) continue;
            const j = idx(nx, ny);
            if (seen[j]) continue;
            seen[j] = 1;
            q.push([nx, ny]);
          }
        }

        // 2) Capture rule: any group of non-selected cells completely surrounded by
        //    the selected color OR the board edge (wall) flips to selected as well.
        captureEnclosed(board, selected);

        currentColor = selected;
        moves++;
        renderAll();
        checkWin();
      }

      function simulateSizeIf(c) {
        if (c === currentColor) return infectedCount;
        const target = currentColor;
        const selected = c;
        const sim = board.slice();

        // Simulated flood from origin (same rule as play)
        const q = [[0, 0]];
        const seen = new Uint8Array(W * H);
        seen[0] = 1;
        while (q.length) {
          const [x, y] = q.pop();
          const i = idx(x, y);
          const col = sim[i];
          if (col !== target && col !== selected) continue;
          sim[i] = selected;
          const nbs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of nbs) {
            const nx = x + dx,
              ny = y + dy;
            if (!inb(nx, ny)) continue;
            const j = idx(nx, ny);
            if (seen[j]) continue;
            seen[j] = 1;
            q.push([nx, ny]);
          }
        }

        // Apply capture rule in the simulation
        captureEnclosed(sim, selected);

        // Count infected after sim (only connected to origin)
        let count = 0;
        const q2 = [[0, 0]];
        const seen2 = new Uint8Array(W * H);
        seen2[0] = 1;
        const tgt = selected;
        while (q2.length) {
          const [x, y] = q2.pop();
          const i = idx(x, y);
          if (sim[i] !== tgt) continue;
          count++;
          const nbs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of nbs) {
            const nx = x + dx,
              ny = y + dy;
            if (!inb(nx, ny)) continue;
            const j = idx(nx, ny);
            if (seen2[j]) continue;
            seen2[j] = 1;
            q2.push([nx, ny]);
          }
        }
        return count;
      }
      // Helper: flip enclosed groups to selected. A group is enclosed if every neighbor
      // outside the group is either the selected color or out-of-bounds (wall).
      function captureEnclosed(arr, selected) {
        const seen = new Uint8Array(W * H);
        const toFlip = [];
        for (let i = 0; i < arr.length; i++) {
          if (seen[i]) continue;
          const col = arr[i];
          if (col === selected) {
            seen[i] = 1;
            continue;
          }
          // BFS same-color component
          const q = [i];
          seen[i] = 1;
          const comp = [];
          let surrounded = true;
          while (q.length) {
            const k = q.pop();
            comp.push(k);
            const x = k % W,
              y = (k / W) | 0;
            const nbs = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ];
            for (const [dx, dy] of nbs) {
              const nx = x + dx,
                ny = y + dy;
              if (!inb(nx, ny)) {
                // wall is fine
                continue;
              }
              const j = idx(nx, ny);
              if (arr[j] === col) {
                if (!seen[j]) {
                  seen[j] = 1;
                  q.push(j);
                }
              } else if (arr[j] !== selected) {
                surrounded = false;
              }
            }
          }
          if (surrounded) {
            for (const k of comp) toFlip.push(k);
          }
        }
        for (const k of toFlip) arr[k] = selected;
        return toFlip.length;
      }

      function hint() {
        let bestColor = null,
          bestGain = -1,
          bestSize = -1;
        for (let c = 0; c < COLORS; c++) {
          if (c === currentColor) continue;
          const size = simulateSizeIf(c);
          const gain = size - infectedCount;
          if (size > bestSize || (size === bestSize && c < bestColor)) {
            bestSize = size;
            bestGain = gain;
            bestColor = c;
          }
        }
        if (bestColor != null) {
          // Flash the suggested swatch
          const sw = document.querySelector(
            `.swatch[data-color="${bestColor}"]`
          );
          if (sw) {
            sw.animate(
              [
                { transform: "scale(1.0)" },
                { transform: "scale(1.06)" },
                { transform: "scale(1.0)" },
              ],
              { duration: 380 }
            );
          }
          return bestColor;
        }
        return null;
      }

      function makePalette() {
        PaletteEl.innerHTML = "";
        const frag = document.createDocumentFragment();
        for (let c = 0; c < COLORS; c++) {
          const b = document.createElement("button");
          b.className = `swatch ${COLOR_CLASSES[c]}`;
          b.dataset.color = String(c);
          b.title = `Strain #${c + 1} (hotkey ${c + 1})`;
          b.onclick = () => chooseColor(c);
          const k = document.createElement("kbd");
          k.textContent = String(c + 1);
          b.appendChild(k);
          frag.appendChild(b);
        }
        PaletteEl.appendChild(frag);
        updatePalette();
      }
      function updatePalette() {
        document
          .querySelectorAll(".swatch")
          .forEach((el) => el.classList.remove("active"));
        const active = document.querySelector(
          `.swatch[data-color="${currentColor}"]`
        );
        if (active) active.classList.add("active");
      }

      function setFromControls() {
        W = H = parseInt(SizeSel.value, 10);
        COLORS = clamp(parseInt(ColorsSel.value, 10), 2, MAX_COLORS);
        const seedStr = (SeedInput.value || "").trim();
        seedUsed = seedStr || Math.random().toString(36).slice(2, 8);
        rng = rngFrom(strHash(seedUsed));
        moves = 0;
        infectedCount = 0;
        undoStack = [];
        makeBoard();
        randomize();
        makePalette();
        renderAll();
        updateBestLabel();
        stopTimer();
        TimerEl.textContent = "00:00";
      }

      function checkWin() {
        if (infectedCount === W * H) {
          stopTimer();
          saveBest(moves);
          updateBestLabel();
          Overlay.classList.add("active");
          Overlay.setAttribute("aria-hidden", "false");
          SummaryEl.textContent = `Moves: ${moves} • Time: ${TimerEl.textContent} • Grid: ${W}×${H} • Strains: ${COLORS} • Seed: ${seedUsed}`;
        }
      }

      // ====== Events ======
      NewBtn.addEventListener("click", setFromControls);
      UndoBtn.addEventListener("click", () => {
        const prev = undoStack.pop();
        if (!prev) return;
        board = prev.board;
        currentColor = prev.currentColor;
        moves = prev.moves;
        renderAll();
      });
      HintBtn.addEventListener("click", () => {
        const c = hint();
        if (c != null) {
          /* no auto-move */
        }
      });
      ResetBestBtn.addEventListener("click", () => {
        localStorage.removeItem(keyBestKey());
        updateBestLabel();
      });

      AgainBtn.addEventListener("click", () => {
        Overlay.classList.remove("active");
        setFromControls();
      });
      CloseBtn.addEventListener("click", () => {
        Overlay.classList.remove("active");
      });

      // Keyboard hotkeys 1..8
      window.addEventListener("keydown", (e) => {
        if (e.key >= "1" && e.key <= "8") {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= COLORS) chooseColor(n - 1);
        }
        if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          UndoBtn.click();
        }
      });

      // URL params -> controls (size, colors, seed)
      (function initFromURL() {
        const u = new URL(window.location.href);
        const qs = u.searchParams;
        if (qs.has("size"))
          SizeSel.value = String(
            clamp(parseInt(qs.get("size") || "14", 10), 10, 30)
          );
        if (qs.has("colors"))
          ColorsSel.value = String(
            clamp(parseInt(qs.get("colors") || "6", 10), 2, 8)
          );
        if (qs.has("seed")) SeedInput.value = qs.get("seed") || "";
      })();

      // Initial boot
      setFromControls();
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: HTML_CONTENT }} />;
}
