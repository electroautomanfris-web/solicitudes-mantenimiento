const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const config = require('./config.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── WhatsApp Business API Helper ──────────────────────────────────────────────

function whatsappAPI(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}${endpoint}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Send Text Message ─────────────────────────────────────────────────────────

async function sendTextMessage(to, text) {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text }
  });
}

// ── Send Template Message (for initial contact) ───────────────────────────────

async function sendTemplate(to, templateName, languageCode = 'es') {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: []
    }
  });
}

// ── Send Location Message ─────────────────────────────────────────────────────

async function sendLocation(to, latitude, longitude, name = '', address = '') {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'location',
    location: {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      name: name,
      address: address
    }
  });
}

// ── Send Interactive List Message ──────────────────────────────────────────────

async function sendServiceMenu(to) {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '🔧 AutoServicio Express'
      },
      body: {
        text: '¿Qué tipo de servicio necesitas? Selecciona una opción:'
      },
      footer: {
        text: 'Toca para ver opciones'
      },
      action: {
        button: 'Ver Servicios',
        sections: [
          {
            title: 'Servicios Mecánicos',
            rows: [
              { id: 'cambio_aceite', title: '🔄 Cambio de Aceite', description: 'Cambio de aceite y filtro' },
              { id: 'frenos', title: '🛑 Frenos', description: 'Reparación y mantenimiento de frenos' },
              { id: 'llantas', title: '⭕ Llantas', description: 'Alineación, balanceo, cambio' },
              { id: 'motor', title: '⚙️ Motor', description: 'Reparación general de motor' },
              { id: 'transmision', title: '🔧 Transmisión', description: 'Reparación de transmisión' }
            ]
          },
          {
            title: 'Servicios Eléctricos y Otros',
            rows: [
              { id: 'electrico', title: '⚡ Eléctrico', description: 'Sistema eléctrico y batería' },
              { id: 'suspension', title: '🔩 Suspensión', description: 'Amortiguadores y dirección' },
              { id: 'diagnostico', title: '🔍 Diagnóstico', description: 'Escaneo computarizado completo' },
              { id: 'latoneria', title: '🎨 Latonería/Pintura', description: 'Reparación de carrocería' },
              { id: 'otro', title: '📝 Otro Servicio', description: 'Otro servicio no listado' }
            ]
          }
        ]
      }
    }
  });
}

// ── Send Quick Reply Buttons ──────────────────────────────────────────────────

async function sendUrgencyOptions(to) {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '⚡ ¿Qué tan urgente es?'
      },
      body: {
        text: 'Selecciona el nivel de urgencia:'
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'urg_normal', title: '🟢 Normal' } },
          { type: 'reply', reply: { id: 'urg_urgente', title: '🟡 Urgente' } },
          { type: 'reply', reply: { id: 'urg_muy_urgente', title: '🔴 Muy Urgente' } }
        ]
      }
    }
  });
}

// ── Send Confirmation with Button ─────────────────────────────────────────────

async function sendConfirmation(to, trackingId) {
  return await whatsappAPI('POST', '/messages', {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '✅ Solicitud Recibida'
      },
      body: {
        text: `Tu solicitud *#${trackingId}* ha sido recibida correctamente.\n\nNuestro equipo te contactará pronto.\n\n¿Qué deseas hacer?`
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'btn_rastrear', title: '📍 Rastrear' } },
          { type: 'reply', reply: { id: 'btn_llamar', title: '📞 Llamar' } },
          { type: 'reply', reply: { id: 'btn_nueva', title: '🔄 Nueva Solicitud' } }
        ]
      }
    }
  });
}

// ── Build Full Service Request Message ────────────────────────────────────────

function buildRequestMessage(data) {
  const urgencyLabels = {
    'normal': '🟢 Normal',
    'urgente': '🟡 Urgente',
    'muy_urgente': '🔴 MUY URGENTE'
  };

  const serviceLabels = {
    'cambio_aceite': 'Cambio de Aceite',
    'frenos': 'Frenos',
    'llantas': 'Llantas',
    'motor': 'Motor',
    'transmision': 'Transmisión',
    'electrico': 'Eléctrico',
    'suspension': 'Suspensión',
    'diagnostico': 'Diagnóstico General',
    'latoneria': 'Latonería/Pintura',
    'otro': 'Otro Servicio'
  };

  let msg = `🔧 *SOLICITUD DE SERVICIO - #${data.trackingId}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `📋 *Servicio:* ${serviceLabels[data.service] || data.service}\n`;
  msg += `📌 *Tipo:* ${data.serviceType}\n`;
  msg += `⚡ *Urgencia:* ${urgencyLabels[data.urgency] || data.urgency}\n\n`;

  msg += `🚗 *VEHÍCULO:*\n`;
  msg += `• Marca: ${data.brand}\n`;
  msg += `• Modelo: ${data.model}\n`;
  msg += `• Año: ${data.year}\n`;

  msg += `\n📝 *PROBLEMA:*\n${data.description}\n\n`;

  msg += `📍 *UBICACIÓN:*\n${data.location}\n`;
  if(data.reference) msg += `📌 Ref: ${data.reference}\n`;

  msg += `\n👤 *CLIENTE:*\n`;
  msg += `• Nombre: ${data.clientName}\n`;
  msg += `• Tel: ${data.clientPhone}\n`;
  if(data.clientEmail) msg += `• Email: ${data.clientEmail}\n`;

  msg += `\n📅 ${new Date().toLocaleDateString('es-DO')} | 🕐 ${new Date().toLocaleTimeString('es-DO')}`;

  return msg;
}

// ── Generate Tracking ID ──────────────────────────────────────────────────────

function generateTrackingId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'AS-';
  for(let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ── Store requests in memory (replace with DB in production) ──────────────────

const serviceRequests = new Map();

// ── API Routes ────────────────────────────────────────────────────────────────

// Send service request to business WhatsApp
app.post('/api/send-request', async (req, res) => {
  try {
    const data = req.body;
    const trackingId = generateTrackingId();
    data.trackingId = trackingId;

    // Store the request
    serviceRequests.set(trackingId, {
      ...data,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    // Build message
    const message = buildRequestMessage(data);

    // Send to business phone (you receive the notification)
    const businessPhone = config.business.phone.replace(/[^0-9]/g, '');
    const result = await sendTextMessage(businessPhone, message);

    // Send confirmation to client
    const clientPhone = data.clientPhone.replace(/[^0-9]/g, '');
    if(clientPhone) {
      await sendConfirmation(clientPhone, trackingId);
    }

    res.json({
      success: true,
      trackingId: trackingId,
      whatsappResult: result
    });

  } catch (error) {
    console.error('Error sending request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send service menu to a phone number
app.post('/api/send-menu', async (req, res) => {
  try {
    const { phone } = req.body;
    const phoneClean = phone.replace(/[^0-9]/g, '');
    const result = await sendServiceMenu(phoneClean);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send text message
app.post('/api/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const phoneClean = phone.replace(/[^0-9]/g, '');
    const result = await sendTextMessage(phoneClean, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook for incoming WhatsApp messages
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if(mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if(body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if(change.field === 'messages') {
          const messages = change.value?.messages;
          messages?.forEach(msg => {
            console.log('Incoming message:', msg);
            // Handle incoming messages here
            // You can auto-reply or process commands
          });
        }
      });
    });
  }

  res.sendStatus(200);
});

// Get tracking info
app.get('/api/track/:id', (req, res) => {
  const request = serviceRequests.get(req.params.id);
  if(request) {
    res.json({ success: true, data: request });
  } else {
    res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  }
});

// Get all requests (admin)
app.get('/api/requests', (req, res) => {
  const all = Array.from(serviceRequests.entries()).map(([id, data]) => ({
    trackingId: id,
    ...data
  }));
  res.json({ success: true, data: all });
});

// ── Start Server ──────────────────────────────────────────────────────────────

const PORT = config.server.port || 3000;
app.listen(PORT, config.server.host || '0.0.0.0', () => {
  console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔧 AutoServicio Express - WhatsApp API
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🌐 Server:     http://localhost:${PORT}
  📱 Panel:      http://localhost:${PORT}/servicio-autoindex.html
  📋 API:        http://localhost:${PORT}/api/
  🪝 Webhook:    http://localhost:${PORT}/webhook
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
