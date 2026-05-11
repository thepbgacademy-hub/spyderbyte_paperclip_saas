import { Activity, Download, HardDrive, KeyRound, Lock, PackageCheck, Play, ShieldCheck, ToggleLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

type Role = "member" | "operator";
type RunStatus = "ready" | "queued" | "completed" | "paused";
type PackageSetupState = "needs-media-provider" | "ready";

declare global {
  interface Window {
    __WF_SERVER_SESSION__?: { role: Role };
  }
}

function getInitialRole(): Role {
  return window.__WF_SERVER_SESSION__?.role === "operator" ? "operator" : "member";
}

function App() {
  const [role] = useState<Role>(getInitialRole);
  const [provider, setProvider] = useState("OpenAI");
  const [keySaved, setKeySaved] = useState(false);
  const [mediaProviderSaved, setMediaProviderSaved] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("ready");
  const [workflowsPaused, setWorkflowsPaused] = useState(false);
  const packageSetupState: PackageSetupState = mediaProviderSaved ? "ready" : "needs-media-provider";

  const statusCopy = useMemo(() => {
    if (runStatus === "completed") return "Workflow completed. Wealth Factory result is ready for download.";
    if (runStatus === "queued") return "Workflow queued. Secure worker is preparing the approved result.";
    if (runStatus === "paused") return "Tenant workflows are disabled.";
    return packageSetupState === "ready" ? "Ready to run the installed package workflow." : "Connect package providers to unlock media workflows.";
  }, [packageSetupState, runStatus]);

  function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = String(new FormData(event.currentTarget).get("apiKey") ?? "");
    if (key.trim()) setKeySaved(true);
    event.currentTarget.reset();
  }

  function saveMediaProvider() {
    setMediaProviderSaved(true);
  }

  function queueRun() {
    if (workflowsPaused) {
      setRunStatus("paused");
      return;
    }
    if (packageSetupState !== "ready") return;
    setRunStatus("queued");
  }

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand"><div className="mark">W</div><div><strong>Wealth Factory</strong><span>Company Console</span></div></div>
        <button className="nav active"><Activity size={18} /> Workflows</button>
        <button className="nav"><PackageCheck size={18} /> Packages</button>
        <button className="nav"><KeyRound size={18} /> Credentials</button>
        <button className="nav"><HardDrive size={18} /> Storage</button>
        <button className="nav"><ShieldCheck size={18} /> Operations</button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><h1>Wealth Factory workspace</h1><p>Northstar Labs | Social Media Agency package | {statusCopy}</p></div>
          <div className="roleBadge" aria-label="Role">{role === "operator" ? "Operator" : "Member"}</div>
        </header>
        <section className="grid">
          <section className="panel" aria-label="Installed package">
            <div className="panelTitle"><PackageCheck size={20} /><h2>Social Media Agency</h2></div>
            <p className="body">Installed package for planning posts, creating approved media, and exporting short-lived deliverables.</p>
            <ul className="compactList">
              <li>Required: OpenAI</li>
              <li>Optional: image and video providers</li>
              <li>Optional: customer-owned storage</li>
            </ul>
          </section>
          <form className="panel" onSubmit={saveKey} aria-label="Connect provider">
            <div className="panelTitle"><KeyRound size={20} /><h2>Connect {provider}</h2></div>
            <label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option>OpenAI</option><option>Anthropic</option><option>xAI Grok</option><option>OpenRouter</option></select></label>
            <label>API key<input name="apiKey" type="password" placeholder="Key is stored by reference" aria-label="API key" /></label>
            <label>Project ID<input name="projectId" placeholder="Optional for OpenAI projects" /></label>
            <button className="primary" type="submit"><Lock size={16} /> Save reference</button>
            {keySaved ? <p className="success" role="status">Credential reference saved. The key will not be shown again.</p> : null}
          </form>
          <section className="panel" aria-label="Package providers">
            <div className="panelTitle"><KeyRound size={20} /><h2>Creative providers</h2></div>
            <p className="body">Package-specific providers unlock image and video workflows without becoming global permissions.</p>
            <button className="secondary" onClick={saveMediaProvider}>Connect image provider</button>
            {mediaProviderSaved ? <p className="success" role="status">Package provider connected for Social Media Agency.</p> : <p className="locked"><Lock size={18} /> Image and video workflows are locked.</p>}
          </section>
          <section className="panel" aria-label="Artifact storage">
            <div className="panelTitle"><HardDrive size={20} /><h2>Delivery storage</h2></div>
            <p className="body">Generated files are temporary by default and expire after 24 hours.</p>
            <button className="secondary"><Download size={16} /> Connect Google Drive</button>
            <button className="secondary">Connect Dropbox</button>
          </section>
          <section className="panel" aria-label="Run workflow">
            <div className="panelTitle"><Play size={20} /><h2>Run media calendar</h2></div>
            <p className="body">Launch the package-approved workflow using connected provider references.</p>
            <button className="primary" onClick={queueRun} disabled={packageSetupState !== "ready"}><Play size={16} /> Queue run</button>
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
