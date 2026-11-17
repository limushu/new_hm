import './components/workspace.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeProvider from './components/ThemeProvider';
import SubsystemProvider from './platform/SubsystemProvider';
import SyncProvider from './platform/SyncProvider';
import './styles.css';
import './themes.css';
import './components/buttons.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SubsystemProvider>
      <ThemeProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </ThemeProvider>
    </SubsystemProvider>
  </React.StrictMode>,
);
