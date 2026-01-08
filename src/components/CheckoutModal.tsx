import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, CreditCard, ShoppingBag, ArrowRight, ArrowLeft, MapPin, Phone, Mail, User, Truck, Pencil, Home, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

interface CartItem {
    id: string;
    title: string;
    price: string;
    quantity: number;
    image_url: string;
}

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    cartItems: CartItem[];
    onOrderSuccess: (orderId: string) => void;
}

type CheckoutStep = 'contact' | 'address' | 'preferences' | 'review' | 'success';

export default function CheckoutModal({ isOpen, onClose, cartItems, onOrderSuccess }: CheckoutModalProps) {
    const [step, setStep] = useState<CheckoutStep>('contact');
    const [isLoading, setIsLoading] = useState(false);
    const [orderId, setOrderId] = useState<string | null>(null);

    // State for all steps
    const [contact, setContact] = useState({ fullName: '', phone: '', email: '' });
    const [address, setAddress] = useState({
        line1: '', area: '', city: 'Mumbai', state: 'Maharashtra',
        pincode: '', landmark: '', label: 'Home'
    });
    const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setStep('contact');
            setIsLoading(false);
            setOrderId(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // --- Calculations ---
    const subTotal = cartItems.reduce((sum, item) => {
        const price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
        return sum + (price * item.quantity);
    }, 0);
    const shippingCost = 100;
    const gstRate = 0.05;
    const gstAmount = subTotal * gstRate;
    const totalAmount = subTotal + shippingCost + gstAmount;


    // --- Validation Helpers ---
    const validateContact = () => {
        if (!contact.fullName.trim()) { toast.error("Full name is required"); return false; }
        if (!/^\d{10}$/.test(contact.phone)) { toast.error("Please enter a valid 10-digit phone number"); return false; }
        return true;
    };

    const validateAddress = () => {
        if (!address.line1.trim()) { toast.error("Address line 1 is required"); return false; }
        if (!address.city.trim()) { toast.error("City is required"); return false; }
        if (!/^\d{6}$/.test(address.pincode)) { toast.error("Please enter a valid 6-digit pincode"); return false; }
        return true;
    };


    // --- Navigation Handlers ---
    const handleNext = () => {
        if (step === 'contact') {
            if (validateContact()) setStep('address');
        } else if (step === 'address') {
            if (validateAddress()) setStep('preferences');
        } else if (step === 'preferences') {
            setStep('review');
        }
    };

    const handleBack = () => {
        if (step === 'address') setStep('contact');
        if (step === 'preferences') setStep('address');
        if (step === 'review') setStep('preferences');
    };

    // --- Final Submission ---
    const handlePlaceOrder = async () => {
        setIsLoading(true);

        // 1. Generate Order ID locally
        const date = new Date();
        const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const newOrderId = `AG-${yyyymmdd}-${randomStr}`;
        setOrderId(newOrderId);

        // 2. Simulate Delay for realism
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Prepare Backend Payload (Concatenating detailed address)
        const fullAddress = `${address.line1}, ${address.area ? address.area + ', ' : ''}${address.landmark ? 'Near ' + address.landmark : ''}`;

        try {
            // Fire and forget email (or await if critical)
            fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_details: {
                        fullName: contact.fullName,
                        email: contact.email || 'no-email@provided.com', // Fallback for backend
                        address: fullAddress,
                        city: address.city,
                        zipCode: address.pincode,
                        country: 'India',
                        paymentMethod: paymentMethod
                    },
                    cart_items: cartItems,
                    order_id_override: newOrderId // Optional: Pass generated ID if backend supports it
                })
            });

            // 4. Success State
            setStep('success');
            onOrderSuccess(newOrderId);

        } catch (err) {
            toast.error("Network error, but order recorded locally.");
            setStep('success'); // Fallback to success for demo purposes
            onOrderSuccess(newOrderId);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Steps Renderers ---

    const renderContact = () => (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Full Name <span className="text-red-400">*</span></label>
                <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input autoFocus type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        placeholder="Aditi Sharma"
                        value={contact.fullName} onChange={e => setContact({ ...contact, fullName: e.target.value })}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number <span className="text-red-400">*</span></label>
                <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input type="tel" maxLength={10} className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        placeholder="9876543210"
                        value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
                <p className="text-xs text-gray-500 mt-1">We'll use this for order updates.</p>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email <span className="text-gray-600">(Optional)</span></label>
                <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input type="email" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        placeholder="aditi@example.com"
                        value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );

    const renderAddress = () => (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Pincode <span className="text-red-400">*</span></label>
                <input type="text" maxLength={6} className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 w-32"
                    placeholder="400001"
                    value={address.pincode} onChange={e => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, '') })}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Flat, House no., Building, Company, Apartment <span className="text-red-400">*</span></label>
                <input type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="101, Galaxy Apartments"
                    value={address.line1} onChange={e => setAddress({ ...address, line1: e.target.value })}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Area, Street, Sector, Village <span className="text-gray-600">(Optional)</span></label>
                <input type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="Andheri West"
                    value={address.area} onChange={e => setAddress({ ...address, area: e.target.value })}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">City <span className="text-red-400">*</span></label>
                    <input type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        value={address.city} onChange={e => setAddress({ ...address, city: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">State <span className="text-red-400">*</span></label>
                    <input type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        value={address.state} onChange={e => setAddress({ ...address, state: e.target.value })}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Landmark <span className="text-gray-600">(Optional)</span></label>
                <input type="text" className="w-full bg-[#0F0F0F] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="Near City Cinema"
                    value={address.landmark} onChange={e => setAddress({ ...address, landmark: e.target.value })}
                />
            </div>

            <div className="pt-2">
                <label className="block text-sm font-medium text-gray-400 mb-2">Address Type</label>
                <div className="flex gap-3">
                    {['Home', 'Office', 'Other'].map(type => (
                        <button key={type} onClick={() => setAddress({ ...address, label: type })}
                            className={`px-4 py-2 rounded-lg text-sm border flex items-center gap-2 transition-colors ${address.label === type ? 'bg-purple-500/20 border-purple-500 text-purple-200' : 'border-white/10 bg-[#0F0F0F] text-gray-400 hover:bg-white/5'}`}
                        >
                            {type === 'Home' && <Home className="w-3 h-3" />}
                            {type === 'Office' && <Briefcase className="w-3 h-3" />}
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderPreferences = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Delivery Option */}
            <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Delivery Method</h3>
                <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                            <Truck className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-white font-medium">Standard Delivery</div>
                            <div className="text-xs text-gray-400">Delivered in 2-4 business days</div>
                        </div>
                    </div>
                    <div className="text-white font-semibold">₹100</div>
                </div>
            </div>

            {/* Payment Method */}
            <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Payment Method</h3>
                <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 cursor-pointer ring-1 ring-purple-500/50">
                        <input type="radio" checked readOnly className="text-purple-500 focus:ring-purple-500 bg-transparent" />
                        <div className="flex-1">
                            <div className="text-white font-medium flex items-center gap-2">
                                <CreditCard className="w-4 h-4" /> Cash on Delivery (COD)
                            </div>
                            <div className="text-xs text-gray-400 mt-1">Pay with cash or UPI upon delivery.</div>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-[#0F0F0F] opacity-50 cursor-not-allowed">
                        <input type="radio" disabled className="bg-transparent" />
                        <div className="flex-1">
                            <div className="text-gray-400 font-medium">Online Payment</div>
                            <div className="text-xs text-gray-500 mt-1">Temporarily unavailable</div>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );

    const renderReview = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Contact Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-medium text-gray-400">Contact</h4>
                    <button onClick={() => setStep('contact')} className="text-purple-400 hover:text-purple-300">
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>
                <div className="text-white text-sm">{contact.fullName}</div>
                <div className="text-gray-400 text-sm">{contact.phone}</div>
                {contact.email && <div className="text-gray-400 text-sm">{contact.email}</div>}
            </div>

            {/* Address Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-medium text-gray-400">Shipping To</h4>
                    <button onClick={() => setStep('address')} className="text-purple-400 hover:text-purple-300">
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-white/10 text-gray-300 px-1.5 py-0.5 rounded">{address.label}</span>
                </div>
                <div className="text-white text-sm leading-relaxed">
                    {address.line1}<br />
                    {address.area && <>{address.area}<br /></>}
                    {address.city}, {address.state} - {address.pincode}<br />
                    IN
                </div>
            </div>

            {/* Payment Card */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-medium text-gray-400">Payment</h4>
                    <button onClick={() => setStep('preferences')} className="text-purple-400 hover:text-purple-300">
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>
                <div className="text-white text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    Cash on Delivery
                </div>
            </div>
        </div>
    );

    const renderSuccess = () => (
        <div className="flex flex-col items-center justify-center py-10 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 ring-1 ring-green-500/50">
                <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Order Placed!</h2>
            <p className="text-gray-400 text-center mb-6 max-w-xs">
                Thank you, {contact.fullName.split(' ')[0]}! Your order has been confirmed.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-full mb-8">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Order ID:</span>
                    <span className="font-mono text-purple-300">{orderId}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Est. Delivery:</span>
                    <span className="text-white">2-4 Days</span>
                </div>
            </div>

            <button onClick={onClose} className="bg-white text-black font-semibold py-3 px-8 rounded-full hover:bg-gray-200 transition-colors">
                Continue Shopping
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl">

                {/* Left: Main Content (Wizard) */}
                <div className="flex-1 flex flex-col min-h-[400px]">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#242424]">
                        <div className="flex items-center gap-3">
                            {step !== 'success' && (
                                <div className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                                    STEP {step === 'contact' ? 1 : step === 'address' ? 2 : step === 'preferences' ? 3 : 4}/4
                                </div>
                            )}
                            <h2 className="text-lg font-semibold text-white">
                                {step === 'contact' && 'Contact Details'}
                                {step === 'address' && 'Shipping Address'}
                                {step === 'preferences' && 'Payment & Delivery'}
                                {step === 'review' && 'Review Order'}
                                {step === 'success' && 'Success'}
                            </h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        {step === 'contact' && renderContact()}
                        {step === 'address' && renderAddress()}
                        {step === 'preferences' && renderPreferences()}
                        {step === 'review' && renderReview()}
                        {step === 'success' && renderSuccess()}
                    </div>

                    {/* Footer Actions */}
                    {step !== 'success' && (
                        <div className="p-6 border-t border-white/10 flex justify-between items-center bg-[#242424]">
                            {step !== 'contact' ? (
                                <button onClick={handleBack} className="text-gray-400 hover:text-white text-sm font-medium flex items-center gap-2 px-2 py-2">
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>
                            ) : <div></div>}

                            <button
                                onClick={step === 'review' ? handlePlaceOrder : handleNext}
                                disabled={isLoading}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {step === 'review' ? (isLoading ? 'Placing Order...' : 'Confirm & Place Order') : 'Next'}
                                {!isLoading && step !== 'review' && <ArrowRight className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right: Order Summary (Visible on DESKTOP, Hidden on Success) */}
                {step !== 'success' && (
                    <div className="hidden md:block w-80 bg-[#151515] border-l border-white/10 p-6 overflow-y-auto">
                        <h3 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Your Order</h3>
                        <div className="space-y-4">
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {cartItems.map((item) => (
                                    <div key={item.id} className="flex gap-3 text-sm group">
                                        {item.image_url ? (
                                            <img src={item.image_url} alt={item.title} className="w-10 h-10 object-cover rounded bg-white/5" />
                                        ) : (
                                            <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-xs text-gray-500">Img</div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-gray-300 truncate group-hover:text-white transition-colors">{item.title}</div>
                                            <div className="text-gray-500 text-xs">Qty: {item.quantity}</div>
                                        </div>
                                        <div className="text-gray-300 font-medium">₹{(parseFloat(item.price.replace(/[^0-9.]/g, '')) * item.quantity).toFixed(0)}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-white/10 space-y-2 text-sm">
                                <div className="flex justify-between text-gray-500">
                                    <span>Subtotal</span>
                                    <span>₹{subTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>GST (5%)</span>
                                    <span>₹{gstAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>Shipping</span>
                                    <span>₹{shippingCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-white font-semibold text-lg pt-2 border-t border-white/10">
                                    <span>Total</span>
                                    <span>₹{totalAmount.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300 mt-4">
                                <p><strong>Demo Mode:</strong> No payment will be processed. An invoice will be simulated.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
