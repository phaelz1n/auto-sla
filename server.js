const express = require('express');
const path = require('path');
require('dotenv').config();

const clientesRoutes = require('./src/routes/clientes.routes');
const ocorrenciasRoutes = require('./src/routes/ocorrencias.routes');
const relatoriosRoutes = require('./src/routes/relatorios.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

app.use('/api', clientesRoutes);
app.use('/api', ocorrenciasRoutes);
app.use('/api', relatoriosRoutes);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Auto SLA rodando em http://localhost:${port}`);
        console.log('Abra este link no seu navegador!');
    });
}

module.exports = app;
