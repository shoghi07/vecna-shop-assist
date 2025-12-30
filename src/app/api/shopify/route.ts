import { NextResponse } from 'next/server';
import { config } from '@/config';

// Helper to determine API version and resource based on action
const getShopifyUrl = (action: string, params: any) => {
    const domain = config.shopify.storeDomain;
    const adminApiVersion = '2025-01'; // Default version
    const draftOrderVersion = '2025-10'; // Specific version for draft orders

    switch (action) {
        case 'create_draft_order':
            return `https://${domain}/admin/api/${draftOrderVersion}/draft_orders.json`;
        case 'complete_draft_order':
            return `https://${domain}/admin/api/${draftOrderVersion}/draft_orders/${params.draft_order_id}/complete.json?payment_pending=true`;
        case 'get_customer':
            return `https://${domain}/admin/api/${adminApiVersion}/customers/search.json?query=email:${params.email}`;
        case 'get_orders':
            return `https://${domain}/admin/api/${adminApiVersion}/orders.json?customer_id=${params.customer_id}&status=any`;
        case 'add_to_cart':
            return `https://${domain}/cart/add.js`;
        default:
            throw new Error(`Unknown action: ${action}`);
    }
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, params, adminToken } = body;

        // adminToken is optional for public actions like add_to_cart
        if (!action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        const url = getShopifyUrl(action, params);
        const method = action === 'complete_draft_order' ? 'PUT' : (action === 'create_draft_order' || action === 'add_to_cart' ? 'POST' : 'GET');

        const headers: any = {
            'Content-Type': 'application/json',
        };

        // Only add Admin Token for admin actions
        if (action !== 'add_to_cart') {
            if (!adminToken) {
                return NextResponse.json({ error: 'Missing adminToken' }, { status: 400 });
            }
            headers['X-Shopify-Access-Token'] = adminToken;
        }

        const fetchOptions: any = {
            method,
            headers,
        };

        if (method === 'POST') {
            // For add_to_cart, payload is direct. For draft_order, it's nested in params.payload
            const payload = action === 'add_to_cart' ? params.payload : params.payload;
            fetchOptions.body = JSON.stringify(payload);
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: `Shopify API Error: ${response.status}`, details: errorText }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Shopify Proxy Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
