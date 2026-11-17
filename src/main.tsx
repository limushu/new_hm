import './components/workspace.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeProvider from './components/ThemeProvider';
import SubsystemProvider from './platform/SubsystemProvider';
import SyncProvider from './platform/SyncProvider';
import DeviceAgendaProvider from './platform/DeviceAgendaProvider';
import './styles.css';
import './themes.css';
import './components/buttons.css';
import './components/page-header.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SubsystemProvider>
      <ThemeProvider>
        <DeviceAgendaProvider>
          <SyncProvider>
            <App />
          </SyncProvider>
        </DeviceAgendaProvider>
      </ThemeProvider>
    </SubsystemProvider>
  </React.StrictMode>,
);
