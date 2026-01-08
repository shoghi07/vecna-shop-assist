import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

// Type definitions
interface CartItem {
    id: string;
    title: string;
    price: string;
    quantity: number;
    image_url: string;
}

interface UserDetails {
    fullName: string;
    email: string;
    address: string;
    city: string;
    zipCode: string;
    country: string;
    paymentMethod: string;
}

interface CheckoutRequest {
    user_details: UserDetails;
    cart_items: CartItem[];
}

export async function POST(req: Request) {
    try {
        const body: CheckoutRequest = await req.json();
        const { user_details, cart_items } = body;

        if (!user_details || !cart_items || cart_items.length === 0) {
            return NextResponse.json({ error: 'Invalid checkout data' }, { status: 400 });
        }

        const orderId = `ORD-${Date.now()}`;
        const totalAmount = cart_items.reduce((sum, item) => {
            const price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
            return sum + (price * item.quantity);
        }, 0);

        // 1. Generate PDF Invoice
        const pdfBuffer = await generateInvoicePDF(orderId, user_details, cart_items, totalAmount);

        // 2. Send Email
        const emailSent = await sendOrderConfirmationEmail(user_details.email, orderId, pdfBuffer);

        return NextResponse.json({
            success: true,
            order_id: orderId,
            message: 'Order placed successfully',
            email_sent: emailSent
        });

    } catch (error) {
        console.error('Checkout failed:', error);
        return NextResponse.json({ error: 'Checkout processing failed' }, { status: 500 });
    }
}

/**
 * Generates a PDF invoice in memory and returns it as a Buffer
 */
async function generateInvoicePDF(orderId: string, user: UserDetails, items: CartItem[], total: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).text('INVOICE', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Order ID: ${orderId}`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // Bill To
        doc.text(`Bill To:`);
        doc.text(user.fullName);
        doc.text(`${user.address}, ${user.city}`);
        doc.text(`${user.zipCode}, ${user.country}`);
        doc.text(`Email: ${user.email}`);
        doc.moveDown();

        // Items Table Header
        const yStart = doc.y;
        doc.text('Item', 50, yStart);
        doc.text('Qty', 300, yStart);
        doc.text('Price', 400, yStart);
        doc.moveDown();

        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // Items
        items.forEach(item => {
            const price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
            const y = doc.y;
            doc.text(item.title.substring(0, 40), 50, y);
            doc.text(item.quantity.toString(), 300, y);
            doc.text(`$${price.toFixed(2)}`, 400, y);
            doc.moveDown();
        });

        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Total
        doc.fontSize(14).text(`Total: $${total.toFixed(2)}`, { align: 'right' });
        doc.fontSize(10).text(`Payment Method: ${user.paymentMethod}`, { align: 'right' });

        doc.end();
    });
}

/**
 * Sends order confirmation email with PDF attachment
 */
async function sendOrderConfirmationEmail(toEmail: string, orderId: string, pdfBuffer: Buffer): Promise<boolean> {

    // Check for credentials
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        console.log('⚠️ No EMAIL_USER/EMAIL_PASS found. Skipping email send.');
        console.log(`[MOCK EMAIL] To: ${toEmail}, Subject: Order Confirmation ${orderId}`);
        return false;
    }

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail', // Simplest for dev, can be configured for others
            auth: { user, pass }
        });

        await transporter.sendMail({
            from: `"Ladani Store" <${user}>`,
            to: toEmail,
            subject: `Order Confirmation - ${orderId}`,
            text: `Thank you for your order! Your Order ID is ${orderId}. Please find the invoice attached.`,
            html: `<h1>Thank you for your order!</h1><p>Your Order ID is <strong>${orderId}</strong>.</p><p>Please find the invoice attached.</p>`,
            attachments: [
                {
                    filename: `invoice-${orderId}.pdf`,
                    content: pdfBuffer
                }
            ]
        });

        console.log(`✅ Email sent to ${toEmail}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send email:', error);
        return false;
    }
}
