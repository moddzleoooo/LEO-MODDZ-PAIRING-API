const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const P = require('pino');

const app = express();
const PORT = 3000;
const AUTH_DIR = './auth_info'; 

// Logger para o Baileys
const logger = P({ level: 'info' });

// Função para remover o diretório de autenticação
function limparAutenticacao() {
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log('Autenticação antiga removida.');
  }
}

// Função para iniciar o socket de autenticação
async function iniciarSocket() {
  limparAutenticacao(); // Apaga os dados antigos antes de autenticar

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR); 

  const wa = makeWASocket({
    logger,
    auth: state, // Passa o estado de autenticação para o Baileys
  });

  // Salva o estado de autenticação sempre que atualizado
  wa.ev.on('creds.update', saveCreds);

  // Escutando eventos de conexão
  wa.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.log('Conexão fechada. Motivo:', motivo);
      setTimeout(() => {
        console.log('Tentando reconectar...');
        iniciarSocket(); // Reconecta em caso de desconexão
      }, 5000); // 5 segundos de espera
    } else if (connection === 'open') {
      console.log('Conectado ao WhatsApp!');
    }
  });

  return wa;
}

// Armazena o socket atual
let waSocket;

// Função para solicitar código repetidamente a cada 3 segundos
async function solicitarCodigoPeriodicamente(numero) {
  if (!waSocket) {
    console.error('O socket não está inicializado!');
    return;
  }

  setInterval(async () => {
    try {
      const codigo = await waSocket.requestPairingCode(numero);
      console.log(`Código enviado para ${numero}: ${codigo}`);
    } catch (erro) {
      console.error('Erro ao solicitar código:', erro);
    }
  }, 3000); // A cada 3 segundos
}

// Inicia o socket e autentica um novo número
async function iniciarNovoNumero(numero) {
  console.log(`Iniciando autenticação para: ${numero}`);

  // Apaga o diretório de autenticação para evitar conflitos
  limparAutenticacao();

  // Inicia um novo socket
  waSocket = await iniciarSocket();

  // Aguarda um pequeno tempo para garantir que o socket esteja pronto
  setTimeout(() => solicitarCodigoPeriodicamente(numero), 5000);
}

// Rota para iniciar a autenticação com um novo número
app.get('/codigo/:numero', async (req, res) => {
  const numero = req.params.numero;
  if (!numero) {
    return res.status(400).json({ erro: 'Número não fornecido!' });
  }

  // Inicia autenticação para o novo número
  await iniciarNovoNumero(numero);

  res.status(200).json({
    mensagem: 'SPM PAIRING SUCESSO ✅ O código será enviado a cada 3 segundos!',
    numero,
  });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});