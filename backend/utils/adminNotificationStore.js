const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const NOTIFICATIONS_FILE = path.join(__dirname, '../data/adminNotifications.json');

// Ensure the file exists
if (!fs.existsSync(NOTIFICATIONS_FILE)) {
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([], null, 2));
}

const getNotifications = () => {
  try {
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading admin notifications:', err);
    return [];
  }
};

const saveNotifications = (notifications) => {
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving admin notifications:', err);
    return false;
  }
};

const addNotification = (notification) => {
  const notifications = getNotifications();
  const newNotif = {
    id: 'notif_' + uuidv4(),
    createdAt: new Date().toISOString(),
    read: false,
    ...notification
  };
  
  // Keep only the last 500 notifications to prevent file overgrowth
  const updatedNotifications = [newNotif, ...notifications].slice(0, 500);
  saveNotifications(updatedNotifications);
  
  // If we have a websocket server, we could emit it here
  // global.io?.emit('admin:notification', newNotif);
  
  return newNotif;
};

const markAsRead = (id) => {
  const notifications = getNotifications();
  const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
  saveNotifications(updated);
};

const markAllAsRead = () => {
  const notifications = getNotifications();
  const updated = notifications.map(n => ({ ...n, read: true }));
  saveNotifications(updated);
};

const deleteNotification = (id) => {
  const notifications = getNotifications();
  const updated = notifications.filter(n => n.id !== id);
  saveNotifications(updated);
};

const clearReadNotifications = () => {
  const notifications = getNotifications();
  const updated = notifications.filter(n => !n.read);
  saveNotifications(updated);
};

module.exports = {
  getNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications
};
