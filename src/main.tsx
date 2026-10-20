import './components/workspace.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeProvider from './components/ThemeProvider';
import SubsystemProvider from './platform/SubsystemProvider';
import './styles.css';
import './themes.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SubsystemProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SubsystemProvider>
  </React.StrictMode>,
);
