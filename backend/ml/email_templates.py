#!/usr/bin/env python3
"""
Email Template Engine for BLACKONN
Generates professional HTML email templates with dynamic content
"""

import json
import sys
from datetime import datetime
import html
import re

# ==========================================
# EMAIL TEMPLATES
# ==========================================

class EmailTemplates:
    def __init__(self):
        self.brand_colors = {
            'primary': '#0b0b0b',
            'secondary': '#333333',
            'accent': '#ffffff',
            'success': '#10b981',
            'warning': '#f59e0b',
            'error': '#ef4444'
        }
        
        self.base_styles = """
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: #0b0b0b; padding: 30px; text-align: center; }
            .logo { color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 2px; }
            .content { padding: 40px 30px; }
            .footer { background: #f8f8f8; padding: 30px; text-align: center; font-size: 12px; color: #666; }
            .btn { display: inline-block; padding: 14px 30px; background: #0b0b0b; color: #ffffff !important; text-decoration: none; font-weight: 600; border-radius: 4px; }
            .btn:hover { background: #333333; }
            h1 { color: #0b0b0b; font-size: 24px; margin: 0 0 20px 0; }
            p { color: #333333; line-height: 1.6; margin: 0 0 15px 0; }
            .order-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
            .order-table th { background: #f8f8f8; font-weight: 600; }
            .total-row { font-weight: bold; font-size: 16px; }
            .highlight { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .social-links { margin-top: 20px; }
            .social-links a { margin: 0 10px; color: #666; text-decoration: none; }
        """
    
    def _base_template(self, content, preview_text=""):
        """Base HTML email template"""
        return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BLACKONN</title>
    <style>{self.base_styles}</style>
    <!--[if mso]>
    <style type="text/css">
        .btn {{ background: #0b0b0b !important; }}
    </style>
    <![endif]-->
</head>
<body>
    <div style="display:none;max-height:0;overflow:hidden;">{html.escape(preview_text)}</div>
    <div class="container">
        <div class="header">
            <div class="logo">BLACKONN</div>
            <div style="color: rgba(255,255,255,0.7); font-size: 12px; margin-top: 5px;">Premium Black Clothing</div>
        </div>
        <div class="content">
            {content}
        </div>
        <div class="footer">
            <p style="margin-bottom: 15px;">© {datetime.now().year} BLACKONN. All rights reserved.</p>
            <p>You're receiving this email because you're a valued BLACKONN customer.</p>
            <div class="social-links">
                <a href="#">Instagram</a> | <a href="#">Facebook</a> | <a href="#">Twitter</a>
            </div>
            <p style="margin-top: 15px; font-size: 11px;">
                <a href="#" style="color: #666;">Unsubscribe</a> | 
                <a href="#" style="color: #666;">Privacy Policy</a>
            </p>
        </div>
    </div>
</body>
</html>
"""
    
    def order_confirmation(self, data):
        """Order confirmation email"""
        order = data.get('order', {})
        customer = data.get('customer', {})
        
        order_id = order.get('id', order.get('orderId', 'N/A'))
        items = order.get('items', [])
        total = order.get('total', 0)
        shipping = order.get('shipping', {})
        
        items_html = ""
        for item in items:
            items_html += f"""
            <tr>
                <td>
                    <strong>{html.escape(str(item.get('name', 'Product')))}</strong><br>
                    <span style="color: #666; font-size: 13px;">
                        Size: {html.escape(str(item.get('size', 'N/A')))} | 
                        Qty: {item.get('quantity', 1)}
                    </span>
                </td>
                <td style="text-align: right;">₹{item.get('price', 0):,.2f}</td>
            </tr>
            """
        
        content = f"""
            <h1>🎉 Order Confirmed!</h1>
            <p>Hi {html.escape(customer.get('name', 'there'))},</p>
            <p>Thank you for your order! We're getting it ready to be shipped. We will notify you when it has been sent.</p>
            
            <div class="highlight">
                <strong>Order Number:</strong> #{html.escape(str(order_id))}<br>
                <strong>Order Date:</strong> {datetime.now().strftime('%B %d, %Y')}
            </div>
            
            <h2 style="font-size: 18px; margin-top: 30px;">Order Summary</h2>
            <table class="order-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style="text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                    <tr class="total-row">
                        <td>Total</td>
                        <td style="text-align: right;">₹{float(total):,.2f}</td>
                    </tr>
                </tbody>
            </table>
            
            <h2 style="font-size: 18px; margin-top: 30px;">Shipping Address</h2>
            <p style="background: #f8f8f8; padding: 15px; border-radius: 4px;">
                {html.escape(shipping.get('name', customer.get('name', '')))}<br>
                {html.escape(shipping.get('address', ''))}<br>
                {html.escape(shipping.get('city', ''))}, {html.escape(shipping.get('state', ''))}<br>
                {html.escape(shipping.get('pincode', ''))}
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" class="btn">Track Order</a>
            </div>
        """
        
        return {
            "subject": f"Order Confirmed! #{order_id}",
            "html": self._base_template(content, f"Your order #{order_id} has been confirmed!"),
            "text": f"Order #{order_id} confirmed. Total: ₹{total}. Thank you for shopping with BLACKONN!"
        }
    
    def shipping_notification(self, data):
        """Shipping notification email"""
        order = data.get('order', {})
        customer = data.get('customer', {})
        tracking = data.get('tracking', {})
        
        content = f"""
            <h1>📦 Your Order is On Its Way!</h1>
            <p>Hi {html.escape(customer.get('name', 'there'))},</p>
            <p>Great news! Your order has been shipped and is on its way to you.</p>
            
            <div class="highlight">
                <strong>Tracking Number:</strong> {html.escape(tracking.get('number', 'N/A'))}<br>
                <strong>Carrier:</strong> {html.escape(tracking.get('carrier', 'Standard Shipping'))}<br>
                <strong>Expected Delivery:</strong> {html.escape(tracking.get('expectedDate', '3-5 business days'))}
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="{html.escape(tracking.get('url', '#'))}" class="btn">Track Package</a>
            </div>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Having issues? Our support team is here to help at support@blackonn.com
            </p>
        """
        
        return {
            "subject": "Your BLACKONN Order Has Shipped! 📦",
            "html": self._base_template(content, "Your order is on its way!"),
            "text": f"Your order has shipped! Tracking: {tracking.get('number', 'N/A')}"
        }
    
    def welcome_email(self, data):
        """Welcome email for new customers"""
        customer = data.get('customer', {})
        promo_code = data.get('promoCode', 'WELCOME10')
        
        content = f"""
            <h1>Welcome to BLACKONN! 🖤</h1>
            <p>Hi {html.escape(customer.get('name', 'there'))},</p>
            <p>Welcome to the BLACKONN family! We're thrilled to have you join our community of style-conscious individuals who appreciate premium black clothing.</p>
            
            <div class="highlight" style="text-align: center;">
                <p style="margin: 0; font-size: 14px;">Here's a special welcome gift for you:</p>
                <p style="font-size: 32px; font-weight: bold; margin: 15px 0; letter-spacing: 3px;">{html.escape(promo_code)}</p>
                <p style="margin: 0; font-size: 14px;">Use this code for <strong>10% OFF</strong> your first order!</p>
            </div>
            
            <h2 style="font-size: 18px; margin-top: 30px;">Why Shop BLACKONN?</h2>
            <ul style="line-height: 2;">
                <li>✓ Premium quality black clothing</li>
                <li>✓ Oversized fits & streetwear styles</li>
                <li>✓ Free shipping on orders above ₹999</li>
                <li>✓ Easy 7-day returns</li>
            </ul>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" class="btn">Start Shopping</a>
            </div>
        """
        
        return {
            "subject": "Welcome to BLACKONN! 🖤 Here's 10% Off",
            "html": self._base_template(content, f"Welcome to BLACKONN! Use {promo_code} for 10% off"),
            "text": f"Welcome to BLACKONN! Use code {promo_code} for 10% off your first order."
        }
    
    def password_reset(self, data):
        """Password reset email"""
        reset_link = data.get('resetLink', '#')
        expires = data.get('expires', '1 hour')
        
        content = f"""
            <h1>Reset Your Password</h1>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{html.escape(reset_link)}" class="btn">Reset Password</a>
            </div>
            
            <p style="font-size: 14px; color: #666;">
                This link will expire in {html.escape(expires)}. If you didn't request this, you can safely ignore this email.
            </p>
            
            <p style="font-size: 13px; color: #999; margin-top: 30px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <span style="word-break: break-all;">{html.escape(reset_link)}</span>
            </p>
        """
        
        return {
            "subject": "Reset Your BLACKONN Password",
            "html": self._base_template(content, "Reset your password"),
            "text": f"Reset your password using this link: {reset_link}"
        }
    
    def abandoned_cart(self, data):
        """Abandoned cart reminder email"""
        customer = data.get('customer', {})
        items = data.get('items', [])
        cart_total = data.get('total', 0)
        discount = data.get('discount', 'COMEBACK10')
        
        items_html = ""
        for item in items[:3]:  # Show max 3 items
            items_html += f"""
            <div style="display: flex; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee;">
                <div style="flex: 1;">
                    <strong>{html.escape(str(item.get('name', 'Product')))}</strong><br>
                    <span style="color: #666;">₹{item.get('price', 0):,.2f}</span>
                </div>
            </div>
            """
        
        content = f"""
            <h1>You Left Something Behind! 🛒</h1>
            <p>Hi {html.escape(customer.get('name', 'there'))},</p>
            <p>We noticed you left some amazing items in your cart. Don't worry, we saved them for you!</p>
            
            <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                {items_html}
                <div style="padding-top: 15px; font-weight: bold; font-size: 18px;">
                    Cart Total: ₹{float(cart_total):,.2f}
                </div>
            </div>
            
            <div class="highlight" style="text-align: center; background: #fef3c7;">
                <p style="margin: 0; font-size: 14px;">Here's a little incentive to complete your order:</p>
                <p style="font-size: 24px; font-weight: bold; margin: 10px 0; color: #0b0b0b;">{html.escape(discount)}</p>
                <p style="margin: 0; font-size: 14px;">Get <strong>10% OFF</strong> when you complete your purchase!</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" class="btn">Complete My Order</a>
            </div>
        """
        
        return {
            "subject": "You Forgot Something! 🛒 Complete Your Order",
            "html": self._base_template(content, f"Complete your purchase and get 10% off with code {discount}"),
            "text": f"Complete your cart purchase! Use {discount} for 10% off. Cart total: ₹{cart_total}"
        }
    
    def review_request(self, data):
        """Review request email after delivery"""
        customer = data.get('customer', {})
        order = data.get('order', {})
        items = order.get('items', [])
        
        content = f"""
            <h1>How Did We Do? ⭐</h1>
            <p>Hi {html.escape(customer.get('name', 'there'))},</p>
            <p>We hope you're loving your recent BLACKONN purchase! Your feedback helps us improve and helps other customers make great choices.</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <p style="font-size: 40px; margin: 0;">⭐⭐⭐⭐⭐</p>
                <p style="color: #666;">Click to rate your experience</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" class="btn">Write a Review</a>
            </div>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666; text-align: center;">
                As a thank you, you'll receive <strong>50 reward points</strong> for each review!
            </p>
        """
        
        return {
            "subject": "How Was Your BLACKONN Order? ⭐",
            "html": self._base_template(content, "Share your experience and earn rewards!"),
            "text": "We'd love to hear about your recent purchase! Leave a review and earn 50 reward points."
        }


def generate_email(data):
    """Generate email template based on type"""
    templates = EmailTemplates()
    email_type = data.get('type', 'welcome')
    
    template_map = {
        'welcome': templates.welcome_email,
        'order_confirmation': templates.order_confirmation,
        'order-confirmation': templates.order_confirmation,
        'shipping': templates.shipping_notification,
        'shipped': templates.shipping_notification,
        'password_reset': templates.password_reset,
        'password-reset': templates.password_reset,
        'abandoned_cart': templates.abandoned_cart,
        'abandoned-cart': templates.abandoned_cart,
        'review': templates.review_request,
        'review_request': templates.review_request
    }
    
    generator = template_map.get(email_type)
    
    if generator:
        return generator(data)
    else:
        return {"error": f"Unknown email type: {email_type}"}


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if not isinstance(input_data, dict):
                input_data = {"data": input_data}
            
            if task == "generate":
                print(json.dumps(generate_email(input_data)))
            elif task == "types":
                print(json.dumps({
                    "available_types": [
                        "welcome", "order_confirmation", "shipping", 
                        "password_reset", "abandoned_cart", "review_request"
                    ]
                }))
            else:
                # Assume task is the email type
                input_data['type'] = task
                print(json.dumps(generate_email(input_data)))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Email Templates v1.0"}))
