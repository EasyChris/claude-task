import { useState } from 'react';
import { LiveContext, useData, useLive, useLiveProvider } from './hooks.js';
import Overview from './pages/Overview.jsx';
import ProjectView from './ProjectView.jsx';
import { matchRoute, useLocation } from './router.jsx';
import ScanModal from './ScanModal.jsx';
import Sidebar from './Sidebar.jsx';
import { ErrorBox, Loading, ToastProvider } from './ui.jsx';

export default function App() {
  const live = useLiveProvider();
  return (
    <LiveContext.Provider value={live}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </LiveContext.Provider>
  );
}

function Shell() {
  const live = useLive();
  const loc = useLocation();
  const route = matchRoute(loc.path);
  const [scanning, setScanning] = useState(false);
  // 任何项目有变化，侧栏计数和总览都要跟着刷新
  const changes = Object.values(live.versions).reduce((a, b) => a + b, 0);
  const projects = useData('/api/projects', `${live.projects}-${changes}`);
  const list = projects.data?.projects || [];
  const project = route.pid ? list.find((p) => p.id === route.pid) : null;
  const openScan = () => setScanning(true);

  let main;
  if (projects.error && !projects.data) main = <div className="page"><ErrorBox error={projects.error} onRetry={projects.reload} /></div>;
  else if (!projects.data) main = <Loading />;
  else if (route.name === 'overview') main = <Overview projects={list} onScan={openScan} />;
  else if (!project) main = <div className="page"><ErrorBox error={{ message: `列表里没有项目「${route.pid}」，可能已经被移出` }} /></div>;
  else {
    main = (
      <ProjectView
        key={project.id}
        project={project}
        route={route}
        search={loc.search}
        version={live.versions[project.id] || 0}
        onRemoved={projects.reload}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar projects={list} current={route.pid} isOverview={route.name === 'overview'} connected={live.connected} onScan={openScan} />
      <main className="main">{main}</main>
      {scanning && (
        <ScanModal
          onClose={() => setScanning(false)}
          onAdded={() => {
            setScanning(false);
            projects.reload();
          }}
        />
      )}
    </div>
  );
}
