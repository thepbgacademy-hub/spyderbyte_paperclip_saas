import { Activity, KeyRound, Lock, Play, ShieldCheck, ToggleLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

type Role = "member" | "operator";
type RunStatus = "ready" | "queued" | "completed" | "paused";

function getInitialRole(): Role {
  return new URLSearchParams(window.location.search).get("role") === "operator" ? "operator" : "member";
}

function App() {
  const [role] = useState<Role>(getInitialRole);
  const [provider, setProvider] = useState("OpenAI");
  const [keySaved, setKeySaved] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("ready");
  const [workflowsPaused, setWorkflowsPaused] = useState(false);

  const statusCopy = useMemo(() => {
    if (runStatus === "completed") return "Workflow completed. Sanitized result is ready.";
    if (runStatus === "queued") return "Workflow queued. Secure worker is processing.";
    if (runStatus === "paused") return "Tenant workflows are disabled.";
    return "Ready to run a workflow.";
  }, [runStatus]);

  function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = String(new FormData(event.currentTarget).get("apiKey") ?? "");
    if (key.trim()) setKeySaved(true);
    event.currentTarget.reset();
  }

  function queueRun() {
    if (workflowsPaused) {
      setRunStatus("paused");
      return;
    }
    setRunStatus("queued");
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand"><div className="mark">S</div><div><strong>SpyderByte</strong><span>Workflow Console</span></div></div>
        <button className="nav active"><Activity size={18} /> Workflows</button>
        <button className="nav"><KeyRound size={18} /> Credentials</button>
        <button className="nav"><ShieldCheck size={18} /> Operations</button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><h1>Secure workflow launch</h1><p>Northstar Labs | {statusCopy}</p></div>
          <div className="roleBadge" aria-label="Role">{role === "operator" ? "Operator" : "Member"}</div>
        </header>
        <section className="grid">
          <form className="panel" onSubmit={saveKey} aria-label="Connect provider">
            <div className="panelTitle"><KeyRound size={20} /><h2>Connect {provider}</h2></div>
            <label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option>OpenAI</option><option>Generic API</option></select></label>
            <label>API key<input name="apiKey" type="password" placeholder="Key is stored by reference" aria-label="API key" /></label>
            <label>Project ID<input name="projectId" placeholder="Optional for OpenAI projects" /></label>
            <button className="primary" type="submit"><Lock size={16} /> Save reference</button>
            {keySaved ? <p className="success" role="status">Credential reference saved. The key will not be shown again.</p> : null}
          </form>
          <section className="panel" aria-label="Run workflow">
            <div className="panelTitle"><Play size={20} /><h2>Run intake workflow</h2></div>
            <p className="body">Launch the tenant-approved workflow using the saved provider reference.</p>
            <button className="primary" onClick={queueRun}><Play size={16} /> Queue run</button>
            <button className="secondary" onClick={() => setRunStatus("completed")}>Mark demo complete</button>
            <div className="result" data-testid="workflow-result">{statusCopy}</div>
          </section>
          <section className="panel wide" aria-label="Operator diagnostics">
            <div className="panelTitle"><ShieldCheck size={20} /><h2>Operator diagnostics</h2></div>
            {role !== "operator" ? <div className="locked"><Lock size={18} /> Operator access required.</div> : (
              <>
                <button className="secondary" onClick={() => setWorkflowsPaused(!workflowsPaused)}><ToggleLeft size={16} /> {workflowsPaused ? "Enable tenant workflows" : "Disable tenant workflows"}</button>
                <table><thead><tr><th>Job</th><th>Status</th><th>Visible fields</th></tr></thead><tbody><tr><td>job-1</td><td>failed</td><td>id, tenant, status</td></tr></tbody></table>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
