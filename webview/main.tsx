import { render } from 'preact';
import { App, type VsCodeApi } from './App';
import './styles.css';

declare function acquireVsCodeApi(): VsCodeApi;

const root = document.getElementById('root');
if (root) render(<App api={acquireVsCodeApi()} />, root);
