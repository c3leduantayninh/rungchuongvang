(() => {
  const C = window.RCV_CONFIG;
  const $ = s => document.querySelector(s);
  const state = {
    token: localStorage.getItem("rcv_token") || "",
    student: null, serverOffset: 0, currentVersion: null,
    answered: false, lockedUntil: 0, timer: null
  };

  function api(action, params={}) {
    return new Promise((resolve, reject) => {
      if (!C.API_URL || C.API_URL.includes("PASTE_")) return reject(new Error("Chưa cấu hình API_URL"));
      const cb = "rcv_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const q = new URLSearchParams({action, callback: cb, ...params});
      script.src = C.API_URL + "?" + q.toString();
      const cleanup = () => { delete window[cb]; script.remove(); };
      window[cb] = data => { cleanup(); data.ok ? resolve(data) : reject(new Error(data.error || "API error")); };
      script.onerror = () => { cleanup(); reject(new Error("Không kết nối được máy chủ")); };
      document.body.appendChild(script);
    });
  }

  function setView(logged) {
    $("#loginView").classList.toggle("hidden", logged);
    $("#quizView").classList.toggle("hidden", !logged);
  }
  function toast(msg) {
    const t=$("#toast"); t.textContent=msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),2400);
  }
  function nowServer(){ return Date.now() + state.serverOffset; }

  async function login(code, password) {
    const r = await api("login", {code, password});
    state.token = r.token; state.student = r.student;
    localStorage.setItem("rcv_token", state.token);
    $("#studentName").textContent = state.student.name;
    setView(true); toast("Đăng nhập thành công!");
    await sync();
  }

  async function sync() {
    try {
      const r = await api("state", {token: state.token || ""});
      if (r.serverTime) state.serverOffset = r.serverTime - Date.now();
      if (r.student) { state.student = r.student; $("#studentName").textContent=r.student.name; }
      renderState(r);
    } catch(e) {
      if (/token|đăng nhập|login/i.test(e.message)) {
        localStorage.removeItem("rcv_token"); state.token=""; setView(false);
      }
    }
  }

  function renderState(s) {
    $("#score").textContent = s.student?.score ?? state.student?.score ?? 0;
    const phase = s.phase;
    if (phase !== "QUESTION") {
      $("#questionPanel").classList.add("hidden");
      $("#waitingPanel").classList.remove("hidden");
      $("#resultPanel").classList.add("hidden");
      if (phase === "FINISHED") {
        $("#waitingPanel").innerHTML = `<div class="pulse-ring">🏆</div><h1>CHƯƠNG TRÌNH ĐÃ KẾT THÚC</h1><p>Cảm ơn các thí sinh đã tham gia Rung Chuông Vàng.</p>`;
      } else {
        $("#waitingPanel").innerHTML = `<div class="pulse-ring">🔔</div><h1>Đang chờ câu hỏi tiếp theo</h1><p>Hãy sẵn sàng. Khi MC chuyển câu, thời gian 10 giây sẽ bắt đầu.</p><div class="loader"></div>`;
      }
      stopTimer(); return;
    }

    $("#waitingPanel").classList.add("hidden");
    $("#resultPanel").classList.add("hidden");
    $("#questionPanel").classList.remove("hidden");

    const q = s.question;
    $("#qNo").textContent = q.number;
    $("#category").textContent = q.category || "KIẾN THỨC";
    $("#questionText").textContent = q.text;
    $("#ansA").textContent=q.A; $("#ansB").textContent=q.B; $("#ansC").textContent=q.C; $("#ansD").textContent=q.D;

    if (state.currentVersion !== s.version) {
      state.currentVersion = s.version; state.answered = !!s.myAnswer;
      document.querySelectorAll(".answer").forEach(b => b.classList.remove("selected","disabled"));
      $("#lockMessage").textContent = state.answered ? "Bạn đã trả lời. Chờ kết quả…" : "";
    }
    if (s.myAnswer) {
      state.answered=true;
      const b=document.querySelector(`.answer[data-key="${s.myAnswer}"]`);
      if(b) b.classList.add("selected");
      document.querySelectorAll(".answer").forEach(x=>x.classList.add("disabled"));
    }
    window.__questionStartedAt = s.questionStartedAt; startTimer(s.questionStartedAt, s.durationMs || 10000);
  }

  function startTimer(startAt, duration) {
    stopTimer();
    const tick=()=>{
      const left=Math.max(0, duration - (nowServer()-startAt));
      const sec=Math.ceil(left/1000);
      $("#timer").textContent=sec;
      $("#timerBar").style.transform=`scaleX(${left/duration})`;
      if(left<=0){ stopTimer(); document.querySelectorAll(".answer").forEach(x=>x.classList.add("disabled")); $("#lockMessage").textContent="HẾT GIỜ — chờ MC chuyển câu"; }
    };
    tick(); state.timer=setInterval(tick,100);
  }
  function stopTimer(){ if(state.timer){clearInterval(state.timer);state.timer=null;} }

  async function answer(key) {
    if (state.answered) return;
    const left = Math.max(0, 10000 - (nowServer() - (window.__questionStartedAt||nowServer())));
    if(left<=0) return;
    state.answered=true;
    document.querySelectorAll(".answer").forEach(x=>x.classList.add("disabled"));
    document.querySelector(`.answer[data-key="${key}"]`)?.classList.add("selected");
    $("#lockMessage").textContent="Đã chốt đáp án ✓";
    try {
      await api("answer", {token:state.token, key});
      toast("Đáp án đã được ghi nhận");
    } catch(e) { toast(e.message); }
  }

  $("#loginForm").addEventListener("submit", async e=>{
    e.preventDefault(); $("#loginError").textContent="";
    try { await login($("#studentCode").value.trim(), $("#password").value); }
    catch(err){ $("#loginError").textContent=err.message; }
  });
  document.querySelectorAll(".answer").forEach(b=>b.addEventListener("click",()=>answer(b.dataset.key)));

  // Keep the browser synchronized. The countdown itself is client-side using server time.
  if(state.token){ setView(true); sync(); }
  setInterval(sync, C.POLL_MS || 3000);
})();
