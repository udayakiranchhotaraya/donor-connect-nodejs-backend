const express = require("express");

const sseRouter = express.Router();
const MAX_QUEUE_SIZE = 100; // Maximum messages to retain
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

let adminClient = null;
let messageQueue = { head: null, tail: null, length: 0 };
let isSending = false;
let heartbeatTimer = null;

// Improved queue structure for O(1) operations
class MessageNode {
    constructor(message, data) {
        this.payload = { message, data };
        this.next = null;
    }
}

sseRouter.get('/', (req, res) => {
    if (adminClient) {
        return res.status(409).end('Another admin is already connected');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    adminClient = res;
    console.log('Admin client connected.');

    // Setup heartbeat
    // heartbeatTimer = setInterval(() => {
    //     try {
    //         adminClient?.write(': heartbeat\n\n');
    //     } catch (err) {
    //         console.error('Heartbeat failed:', err);
    //     }
    // }, HEARTBEAT_INTERVAL);

    const cleanup = () => {
        clearInterval(heartbeatTimer);
        adminClient = null;
        console.log('Admin client disconnected.');
        processQueue();
    };

    const errorHandler = (err) => {
        console.error('SSE connection error:', err);
        cleanup();
    };

    res.on('error', errorHandler);
    req.on('close', cleanup);
    processQueue();
});

function queueNotification(message, data) {
    // Maintain queue size limit
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
        messageQueue.head = messageQueue.head.next;
        messageQueue.length--;
    }

    const newNode = new MessageNode(message, data);
    if (!messageQueue.head) {
        messageQueue.head = newNode;
        messageQueue.tail = newNode;
    } else {
        messageQueue.tail.next = newNode;
        messageQueue.tail = newNode;
    }
    messageQueue.length++;

    if (!isSending) processQueue();
}

function processQueue() {
    if (isSending || !adminClient || messageQueue.length === 0) return;

    isSending = true;
    const currentMessage = messageQueue.head;
    messageQueue.head = currentMessage.next;
    messageQueue.length--;

    try {
        adminClient.write(`data: ${JSON.stringify(currentMessage.payload)}\n\n`, (err) => {
            isSending = false;
            if (err) {
                console.error('Message delivery failed:', err);
                adminClient = null;
            }
            processQueue();
        });
    } catch (err) {
        console.error('Message write error:', err);
        adminClient = null;
        isSending = false;
    }
}

function notifyAdmin(message, data) {
    queueNotification(message, data);
}

module.exports = { sseRouter, notifyAdmin };