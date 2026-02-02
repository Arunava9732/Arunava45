const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sendBulkEmails } = require('../utils/email');
const { addNotification } = require('../utils/adminNotificationStore');

const NEWSLETTERS_FILE = path.join(__dirname, '../data/newsletters.json');
const SUBSCRIBERS_FILE = path.join(__dirname, '../data/newsletterSubscribers.json');

// Helper functions
async function readNewsletters() {
    try {
        const data = await fs.readFile(NEWSLETTERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeNewsletters(newsletters) {
    await fs.writeFile(NEWSLETTERS_FILE, JSON.stringify(newsletters, null, 2));
}

async function readSubscribers() {
    try {
        const data = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeSubscribers(subscribers) {
    await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
}

// Get all newsletters (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        res.json({ success: true, newsletters });
    } catch (error) {
        logger.error('Failed to get newsletters:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve newsletters' });
    }
});

// Get all subscribers (admin only) - MUST be before /:id route
router.get('/subscribers/list', authenticate, requireAdmin, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        
        // Get stats
        const stats = {
            total: subscribers.length,
            active: subscribers.filter(s => s.status === 'active' || s.active === true).length,
            unsubscribed: subscribers.filter(s => s.status === 'unsubscribed' || s.active === false).length
        };
        
        res.json({ success: true, subscribers, stats });
    } catch (error) {
        logger.error('Failed to get subscribers:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve subscribers' });
    }
});

// Alias for /subscribers/list to match different frontend calls
router.get('/subscribers', authenticate, requireAdmin, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        res.json({ 
            success: true, 
            subscribers,
            total: subscribers.length,
            active: subscribers.filter(s => s.status === 'active' || s.active === true).length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve subscribers' });
    }
});

// Alias for /subscribers/list to match /subscribers
router.get('/subscribers', authenticate, requireAdmin, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        res.json({ 
            success: true, 
            subscribers,
            total: subscribers.length,
            active: subscribers.filter(s => s.status === 'active' || s.active === true).length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to retrieve subscribers' });
    }
});

// Subscribe to newsletter (public)
router.post('/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        const subscribers = await readSubscribers();
        const exists = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());

        if (exists) {
            if (exists.status === 'active' || exists.active === true) {
                return res.json({ success: true, message: 'Already subscribed' });
            }
            exists.status = 'active';
            exists.active = true;
            exists.updatedAt = new Date().toISOString();
        } else {
            subscribers.push({
                id: Math.random().toString(36).substr(2, 9),
                email: email.toLowerCase(),
                status: 'active',
                active: true,
                subscribedAt: new Date().toISOString()
            });
        }

        await writeSubscribers(subscribers);
        res.json({ success: true, message: 'Successfully subscribed' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Subscription failed' });
    }
});

// Get newsletter statistics - MUST be before /:id route
router.get('/stats/overview', authenticate, requireAdmin, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        const subscribers = await readSubscribers();
        
        const stats = {
            totalNewsletters: newsletters.length,
            draftNewsletters: newsletters.filter(n => n.status === 'draft').length,
            sentNewsletters: newsletters.filter(n => n.status === 'sent').length,
            totalSubscribers: subscribers.length,
            activeSubscribers: subscribers.filter(s => s.status === 'active' || s.active === true).length,
            unsubscribed: subscribers.filter(s => s.status === 'unsubscribed' || s.active === false).length,
            totalRecipients: newsletters.reduce((sum, n) => sum + (n.recipientCount || 0), 0),
            averageOpenRate: newsletters.filter(n => n.status === 'sent').length > 0 
                ? (newsletters.filter(n => n.status === 'sent').reduce((sum, n) => sum + (n.openCount || 0), 0) / 
                   newsletters.filter(n => n.status === 'sent').reduce((sum, n) => sum + (n.recipientCount || 1), 0) * 100).toFixed(2)
                : 0
        };
        
        res.json({ success: true, stats });
    } catch (error) {
        logger.error('Failed to get newsletter stats:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve statistics' });
    }
});

// Get single newsletter - MUST be after specific routes
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        const newsletter = newsletters.find(n => n.id === req.params.id);
        
        if (!newsletter) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }
        
        res.json({ success: true, newsletter });
    } catch (error) {
        logger.error('Failed to get newsletter:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve newsletter' });
    }
});

// Create newsletter
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { subject, content, status } = req.body;
        
        if (!subject || !content) {
            return res.status(400).json({ success: false, error: 'Subject and content are required' });
        }
        
        const newsletters = await readNewsletters();
        
        const newsletter = {
            id: `newsletter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            subject,
            content,
            status: status || 'draft', // draft, scheduled, sent
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: req.user.email,
            sentAt: null,
            recipientCount: 0,
            openCount: 0,
            clickCount: 0
        };
        
        newsletters.push(newsletter);
        await writeNewsletters(newsletters);
        
        logger.info(`Newsletter created: ${newsletter.id} by ${req.user.email}`);
        res.json({ success: true, newsletter });
    } catch (error) {
        logger.error('Failed to create newsletter:', error);
        res.status(500).json({ success: false, error: 'Failed to create newsletter' });
    }
});

// Update newsletter
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { subject, content, status } = req.body;
        const newsletters = await readNewsletters();
        const index = newsletters.findIndex(n => n.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }
        
        // Don't allow editing sent newsletters
        if (newsletters[index].status === 'sent') {
            return res.status(400).json({ success: false, error: 'Cannot edit sent newsletters' });
        }
        
        newsletters[index] = {
            ...newsletters[index],
            subject: subject || newsletters[index].subject,
            content: content || newsletters[index].content,
            status: status || newsletters[index].status,
            updatedAt: new Date().toISOString()
        };
        
        await writeNewsletters(newsletters);
        
        logger.info(`Newsletter updated: ${req.params.id} by ${req.user.email}`);
        res.json({ success: true, newsletter: newsletters[index] });
    } catch (error) {
        logger.error('Failed to update newsletter:', error);
        res.status(500).json({ success: false, error: 'Failed to update newsletter' });
    }
});

// Delete newsletter
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        const index = newsletters.findIndex(n => n.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }
        
        const deleted = newsletters.splice(index, 1)[0];
        await writeNewsletters(newsletters);
        
        logger.info(`Newsletter deleted: ${req.params.id} by ${req.user.email}`);
        res.json({ success: true, message: 'Newsletter deleted', newsletter: deleted });
    } catch (error) {
        logger.error('Failed to delete newsletter:', error);
        res.status(500).json({ success: false, error: 'Failed to delete newsletter' });
    }
});

// Send newsletter to all subscribers
router.post('/:id/send', authenticate, requireAdmin, async (req, res) => {
    try {
        const newsletters = await readNewsletters();
        const subscribers = await readSubscribers();
        const index = newsletters.findIndex(n => n.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Newsletter not found' });
        }
        
        const newsletter = newsletters[index];
        
        if (newsletter.status === 'sent') {
            return res.status(400).json({ success: false, error: 'Newsletter already sent' });
        }
        
        // Get active subscribers
        const activeSubscribers = subscribers.filter(s => s.status === 'active');
        
        if (activeSubscribers.length === 0) {
            return res.status(400).json({ success: false, error: 'No active subscribers' });
        }
        
        // Send emails (this happens in background)
        const emailList = activeSubscribers.map(s => ({
            to: s.email,
            name: s.name || 'Valued Customer'
        }));
        
        // Send newsletter via email
        sendBulkEmails(emailList, newsletter.subject, newsletter.content)
            .then(() => {
                logger.info(`Newsletter ${newsletter.id} sent to ${emailList.length} subscribers`);
            })
            .catch(err => {
                logger.error(`Failed to send newsletter ${newsletter.id}:`, err);
            });
        
        // Update newsletter status
        newsletters[index] = {
            ...newsletter,
            status: 'sent',
            sentAt: new Date().toISOString(),
            recipientCount: activeSubscribers.length,
            updatedAt: new Date().toISOString()
        };
        
        await writeNewsletters(newsletters);
        
        logger.info(`Newsletter sent: ${newsletter.id} to ${activeSubscribers.length} subscribers by ${req.user.email}`);
        res.json({ 
            success: true, 
            message: `Newsletter sent to ${activeSubscribers.length} subscribers`,
            newsletter: newsletters[index]
        });
    } catch (error) {
        logger.error('Failed to send newsletter:', error);
        res.status(500).json({ success: false, error: 'Failed to send newsletter' });
    }
});

// Subscribe to newsletter (public endpoint)
router.post('/subscribe', async (req, res) => {
    try {
        const { email, name, source } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        
        const subscribers = await readSubscribers();
        
        // Check if already subscribed
        const existing = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
        
        if (existing) {
            if (existing.status === 'active') {
                return res.json({ success: true, message: 'Already subscribed', alreadySubscribed: true });
            } else {
                // Reactivate subscription
                existing.status = 'active';
                existing.resubscribedAt = new Date().toISOString();
                await writeSubscribers(subscribers);
                return res.json({ success: true, message: 'Subscription reactivated' });
            }
        }
        
        // Add new subscriber
        const subscriber = {
            id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            email: email.toLowerCase(),
            name: name || null,
            status: 'active',
            source: source || 'website',
            subscribedAt: new Date().toISOString(),
            unsubscribedAt: null
        };
        
        subscribers.push(subscriber);
        await writeSubscribers(subscribers);

        // Add to Admin Notification Panel
        addNotification({
            type: 'newsletter',
            title: 'New Newsletter Subscriber',
            message: `New subscriber: ${email}${name ? ` (${name})` : ''}`,
            priority: 'low',
            link: '#newsletter',
            data: { email, source: source || 'website' }
        });
        
        logger.info(`New newsletter subscriber: ${email} from ${source || 'website'}`);
        res.json({ success: true, message: 'Successfully subscribed to newsletter' });
    } catch (error) {
        logger.error('Failed to subscribe:', error);
        res.status(500).json({ success: false, error: 'Failed to subscribe' });
    }
});

// Unsubscribe from newsletter (public endpoint)
router.post('/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        
        const subscribers = await readSubscribers();
        const subscriber = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
        
        if (!subscriber) {
            return res.status(404).json({ success: false, error: 'Subscriber not found' });
        }
        
        subscriber.status = 'unsubscribed';
        subscriber.unsubscribedAt = new Date().toISOString();
        
        await writeSubscribers(subscribers);
        
        logger.info(`Newsletter unsubscribe: ${email}`);
        res.json({ success: true, message: 'Successfully unsubscribed from newsletter' });
    } catch (error) {
        logger.error('Failed to unsubscribe:', error);
        res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
    }
});

// Delete subscriber (admin only)
router.delete('/subscribers/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const subscribers = await readSubscribers();
        const index = subscribers.findIndex(s => s.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Subscriber not found' });
        }
        
        const deleted = subscribers.splice(index, 1)[0];
        await writeSubscribers(subscribers);
        
        logger.info(`Subscriber deleted: ${deleted.email} by ${req.user.email}`);
        res.json({ success: true, message: 'Subscriber deleted' });
    } catch (error) {
        logger.error('Failed to delete subscriber:', error);
        res.status(500).json({ success: false, error: 'Failed to delete subscriber' });
    }
});

module.exports = router;
