import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';
import { Provider } from 'react-redux'
import { Store } from 'webext-redux'

const store = new Store()

store.ready().then((result) => {
    console.log('store ready result', result);
    console.log('store', store, store.getState());
    return ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <Provider store={store}>
                <App/>
            </Provider>
        </React.StrictMode>,
    );
})
