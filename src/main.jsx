import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './routes/App.jsx';
import '@/index.css';
import { AuthProvider } from '@/hooks/useAuth.jsx';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================================================
// CUÁNDO SE VUELVEN A PEDIR LOS DATOS
// ----------------------------------------------------------------------------
// Antes: refetchOnWindowFocus en false y 5 minutos de vigencia. O sea que uno se
// iba al SII, volvía a la pestaña y seguía viendo lo de antes; y aunque cambiara
// de pantalla y regresara, tampoco se volvía a pedir. De ahí la sensación de
// "tengo que actualizar la página para que se note el cambio".
//
// Ahora se refresca solo al volver a la pestaña y al recuperar la conexión. Los
// 30 segundos de vigencia evitan el otro extremo: pedir lo mismo dos veces
// seguidas por cambiar de pantalla y volver.
//
// Una consulta que sea cara puede subir su propio staleTime; esto es el default,
// no una regla.
// ============================================================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      // Se cortó internet y volvió: lo primero es dejar de mostrar datos viejos.
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 1000 * 30,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <App/>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);