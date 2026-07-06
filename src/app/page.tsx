'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Send,
  Mic,
  Plus,
  X,
  Settings,
  Trash2,
  MoreVertical,
  LogOut,
  Lock,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  image?: string;
  mimeType?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UNITS = ['pcs', 'kg', 'liter', 'meter', 'box', 'pack', 'dozen'] as const;

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  text: 'Namaste! 🙏 Umapati Vastralay mein aapka swagat hai. Mujhse kisi bhi product ka naam poochho, main aapko price bata dunga. Ya phir koi bill ki photo upload karo, main usse products auto-read kar lunga.',
  sender: 'bot',
  timestamp: new Date(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }) + ' ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('uv_auth');
    if (saved) {
      setIsLoggedIn(true);
    }
  }, []);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Image upload state
  const [selectedImage, setSelectedImage] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('pcs');
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  // ─── Auto-scroll to bottom ────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ─── Fetch products ───────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      // Products might not exist yet — that's fine
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ─── Image handling ───────────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSelectedImage({
        base64,
        mimeType: file.type,
        preview: reader.result as string,
      });
    };
    reader.readAsDataURL(file);

    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    // If an image is selected, send it to bill reader
    if (selectedImage) {
      const userMsg: ChatMessage = {
        id: generateId(),
        text: '',
        sender: 'user',
        timestamp: new Date(),
        image: selectedImage.preview,
        mimeType: selectedImage.mimeType,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      setSelectedImage(null);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch('/api/read-bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: selectedImage.base64,
            mimeType: selectedImage.mimeType,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Server error');
        }

        // Refresh product list after bill read
        fetchProducts();

        const botMsg: ChatMessage = {
          id: generateId(),
          text: data.response || 'Bill read ho gaya!',
          sender: 'bot',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: generateId(),
          text: 'Kuch gadbad ho gayi. Dubara try karo. 🙏',
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        toast.error('Failed to read bill');
      } finally {
        setIsTyping(false);
        textInputRef.current?.focus();
      }
      return;
    }

    // Send text message
    const text = inputText.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server error');
      }

      const botMsg: ChatMessage = {
        id: generateId(),
        text: data.response || 'Mujhe samajh nahi aaya. Dobara poocho. 🤔',
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const errorMsg: ChatMessage = {
        id: generateId(),
        text: `❌ Error: ${errMsg}`,
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      toast.error('Failed to send message');
    } finally {
      setIsTyping(false);
      textInputRef.current?.focus();
    }
  };

  // ─── Add product ──────────────────────────────────────────────────────────
  const handleAddProduct = async () => {
    const name = newProductName.trim();
    const price = parseFloat(newProductPrice);

    if (!name) {
      toast.error('Product naam daalo');
      return;
    }
    if (isNaN(price) || price <= 0) {
      toast.error('Valid price daalo');
      return;
    }

    setIsAddingProduct(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, unit: newProductUnit }),
      });
      const data = await res.json();
      setProducts((prev) => [...prev, data]);
      setNewProductName('');
      setNewProductPrice('');
      setNewProductUnit('pcs');
      toast.success(`"${name}" add ho gaya! ✅`);
    } catch {
      toast.error('Product add nahi ho paya');
    } finally {
      setIsAddingProduct(false);
    }
  };

  // ─── Delete product ───────────────────────────────────────────────────────
  const handleDeleteProduct = async (id: string, name: string) => {
    try {
      await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success(`"${name}" delete ho gaya`);
    } catch {
      toast.error('Delete nahi ho paya');
    }
  };

  // ─── Login handler ─────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('Username aur password dono daalo');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('uv_auth', data.token);
        setIsLoggedIn(true);
        toast.success('Login successful!');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch {
      setLoginError('Network error. Dubara try karo.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('uv_auth');
    setIsLoggedIn(false);
    setLoginUsername('');
    setLoginPassword('');
    toast.success('Logout ho gaye');
  };

  // ─── Handle key press ─────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0b141a 0%, #0d1f2d 30%, #0f2b1e 60%, #111b21 100%)' }}>
        {/* Decorative blurred circles */}
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-[#00a884]/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-[#00a884]/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#00a884]/5 rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-sm relative z-10"
        >
          <div className="rounded-2xl p-8 shadow-2xl border border-white/10" style={{ background: 'linear-gradient(160deg, rgba(30,46,53,0.95) 0%, rgba(20,35,42,0.98) 50%, rgba(15,30,25,0.95) 100%)', backdropFilter: 'blur(20px)' }}>
            {/* Top decorative line */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#00a884]/60 to-transparent" />

            {/* Logo */}
            <div className="flex flex-col items-center mb-8 mt-2">
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#00a884]/50 shadow-lg shadow-[#00a884]/20">
                  <img src="/logo.png" alt="Umapati Vastralay" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#00a884] rounded-full flex items-center justify-center border-2 border-[#1e2e35]">
                  <Lock size={12} className="text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-wide">Umapati Vastralay</h1>
              <p className="text-gray-400 text-sm mt-1">Login karein aage badhne ke liye</p>
            </div>

            {/* Error */}
            <AnimatePresence>
              {loginError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/15 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4 text-center"
                >
                  {loginError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-gray-300 text-sm mb-1.5 block">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Username daalo"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loginPasswordRef.current?.focus();
                  }}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-[#00a884] h-12 rounded-xl transition-colors"
                  autoComplete="username"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-gray-300 text-sm mb-1.5 block">
                  Password
                </Label>
                <Input
                  ref={loginPasswordRef}
                  id="password"
                  type="password"
                  placeholder="Password daalo"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogin();
                  }}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-[#00a884] h-12 rounded-xl transition-colors"
                  autoComplete="current-password"
                />
              </div>

              <Button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full h-12 rounded-xl text-base font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-[#00a884]/25 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #00a884 0%, #00c49a 100%)' }}
              >
                {isLoggingIn ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Login ho raha hai...
                  </div>
                ) : (
                  'Login'
                )}
              </Button>
            </div>

            <p className="text-gray-500 text-xs text-center mt-6">
              Umapati Vastralay — Product Management Bot
            </p>

            {/* Bottom decorative line */}
            <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#00a884]/30 to-transparent" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#111b21] max-w-lg mx-auto relative overflow-hidden shadow-2xl">
      {/* ── Header (Fixed) ──────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 py-2.5 shrink-0 z-20"
        style={{ backgroundColor: '#075E54' }}
      >
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Umapati Vastralay"
            className="rounded-full object-cover"
            style={{ width: 40, height: 40, backgroundColor: '#128C7E' }}
          />
          <div>
            <h1 className="text-white font-semibold text-base leading-tight">
              Umapati Vastralay
            </h1>
            <p className="text-green-200 text-xs">online</p>
          </div>
        </div>

        {/* 3-dot menu + Settings */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <MoreVertical size={22} />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setMessages([WELCOME_MESSAGE]);
                  toast.success('Chat clear ho gaya!');
                }}
              >
                <Trash2 size={16} className="mr-2" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/products/clear', { method: 'POST' });
                    if (res.ok) {
                      setProducts([]);
                      fetchProducts();
                      toast.success('Saare products delete ho gaye!');
                    } else {
                      toast.error('Products delete nahi ho paye');
                    }
                  } catch {
                    toast.error('Error: Products clear nahi ho paye');
                  }
                }}
              >
                <Trash2 size={16} className="mr-2" />
                Clear All Products
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={handleLogout}
              >
                <LogOut size={16} className="mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <Settings size={22} />
                <span className="sr-only">Product Management</span>
              </Button>
            </SheetTrigger>

          <SheetContent side="right" className="p-0 w-full sm:max-w-sm">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="text-lg">Product Management</SheetTitle>
              <SheetDescription>
                Add, view, or delete products from your store
              </SheetDescription>
            </SheetHeader>

            {/* ── Add Product Form ─────────────────────────────────────────── */}
            <div className="px-4 pb-4 border-b">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="prod-name" className="text-sm mb-1">
                    Product Name
                  </Label>
                  <Input
                    id="prod-name"
                    placeholder="e.g. Toor Dal"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddProduct();
                      }
                    }}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="prod-price" className="text-sm mb-1">
                      Price (₹)
                    </Label>
                    <Input
                      id="prod-price"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="150"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddProduct();
                        }
                      }}
                    />
                  </div>
                  <div className="w-28">
                    <Label className="text-sm mb-1">Unit</Label>
                    <Select
                      value={newProductUnit}
                      onValueChange={setNewProductUnit}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleAddProduct}
                  disabled={isAddingProduct}
                  className="w-full"
                  style={{ backgroundColor: '#075E54' }}
                >
                  {isAddingProduct ? 'Adding...' : 'Add Product'}
                </Button>
              </div>
            </div>

            {/* ── Product List ──────────────────────────────────────────────── */}
            <div className="px-4 py-3">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                All Products ({products.length})
              </h3>
              <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No products yet. Add one above!
                  </p>
                ) : (
                  products.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(product.price)} / {product.unit}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {formatDate(product.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={() =>
                          handleDeleteProduct(product.id, product.name)
                        }
                      >
                        <Trash2 size={15} />
                        <span className="sr-only">Delete {product.name}</span>
                      </Button>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </header>

      {/* ── Chat Area ──────────────────────────────────────────────────────── */}
      <main
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5 custom-scrollbar"
        style={{
          backgroundColor: '#ECE5DD',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Welcome date divider */}
        <div className="flex justify-center mb-2">
          <span className="bg-white/80 text-[11px] text-gray-500 px-3 py-1 rounded-lg shadow-sm">
            Today
          </span>
        </div>

        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="relative max-w-[85%] sm:max-w-[75%]">
                {/* Bubble tail */}
                <div
                  className={`absolute top-0 w-3 h-3 overflow-hidden ${
                    message.sender === 'user'
                      ? '-right-2'
                      : '-left-2'
                  }`}
                >
                  <div
                    className={`w-4 h-4 transform rotate-45 ${
                      message.sender === 'user'
                        ? 'bg-[#DCF8C6] -translate-x-1.5'
                        : 'bg-white translate-x-1.5'
                    }`}
                  />
                </div>

                <div
                  className={`px-3 pt-1.5 pb-1 ${
                    message.sender === 'user'
                      ? 'bg-[#DCF8C6] rounded-lg rounded-tr-none'
                      : 'bg-white rounded-lg rounded-tl-none shadow-sm'
                  }`}
                >
                  {/* Image preview */}
                  {message.image && (
                    <div className="mb-1.5 -mt-0.5">
                      <img
                        src={message.image}
                        alt="Uploaded bill"
                        className="rounded-md max-h-52 w-auto object-contain cursor-pointer"
                        onClick={() => window.open(message.image, '_blank')}
                      />
                    </div>
                  )}

                  {/* Message text */}
                  {message.text && (
                    <p className="text-[14.5px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                      {message.text}
                    </p>
                  )}

                  {/* Timestamp */}
                  <div className="flex justify-end items-center gap-1 mt-0.5">
                    <span className="text-[11px] text-gray-500 leading-none">
                      {formatTime(message.timestamp)}
                    </span>
                    {message.sender === 'user' && (
                      <svg
                        className="w-4 h-3 text-blue-500"
                        viewBox="0 0 16 11"
                        fill="currentColor"
                      >
                        <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.085a.463.463 0 0 0-.336-.144.465.465 0 0 0-.347.154.52.52 0 0 0-.149.358c0 .135.055.266.154.363l2.358 2.448c.096.1.22.15.352.15h.02c.138-.006.267-.066.36-.167l6.549-8.082a.504.504 0 0 0-.075-.707z" />
                        <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.244.708-.873a.504.504 0 0 0-.075-.707.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L5.98 7.23l-.012.013-.07.086 2.358 2.448c.096.1.22.15.352.15h.02c.138-.006.267-.066.36-.167l6.549-8.082a.504.504 0 0 0-.075-.707z" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start"
            >
              <div className="relative max-w-[85%]">
                {/* Bubble tail */}
                <div className="absolute top-0 -left-2 w-3 h-3 overflow-hidden">
                  <div className="w-4 h-4 transform rotate-45 bg-white translate-x-1.5" />
                </div>
                <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-4 py-3">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="typing-dot bg-gray-400 w-2 h-2 rounded-full" />
                    <span
                      className="typing-dot bg-gray-400 w-2 h-2 rounded-full"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <span
                      className="typing-dot bg-gray-400 w-2 h-2 rounded-full"
                      style={{ animationDelay: '0.3s' }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </main>

      {/* ── Image Preview Thumbnail ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden"
            style={{ backgroundColor: '#F0F0F0' }}
          >
            <div className="max-w-lg mx-auto px-3 py-2 flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                <img
                  src={selectedImage.preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">
                  Bill Image
                </p>
                <p className="text-[11px] text-gray-500">Ready to send</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-800"
                onClick={removeImage}
              >
                <X size={18} />
                <span className="sr-only">Remove image</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input Area (Fixed) ──────────────────────────────────────────── */}
      <footer
        className="shrink-0 px-2 py-2 flex items-end gap-2 z-20"
        style={{ backgroundColor: '#F0F0F0' }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
          aria-label="Upload image"
        />

        {/* Attach button */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-10 w-10 rounded-full text-gray-600 hover:bg-gray-200/70"
          onClick={() => fileInputRef.current?.click()}
          disabled={isTyping}
        >
          <Plus size={22} />
          <span className="sr-only">Attach image</span>
        </Button>

        {/* Text input */}
        <div className="flex-1">
          <Input
            ref={textInputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isTyping}
            className="rounded-3xl border-none bg-white px-4 py-2.5 text-[15px] shadow-sm h-11 focus-visible:ring-1 focus-visible:ring-gray-300"
          />
        </div>

        {/* Send / Mic button */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-10 w-10 rounded-full hover:bg-gray-200/70"
          onClick={sendMessage}
          disabled={isTyping || (!inputText.trim() && !selectedImage)}
          style={
            inputText.trim() || selectedImage
              ? { color: '#075E54' }
              : { color: '#6B7280' }
          }
        >
          {inputText.trim() || selectedImage ? (
            <Send size={22} />
          ) : (
            <Mic size={22} />
          )}
          <span className="sr-only">
            {inputText.trim() || selectedImage ? 'Send message' : 'Voice input'}
          </span>
        </Button>
      </footer>

      {/* ── Typing indicator keyframes ──────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes typingBounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        .typing-dot {
          animation: typingBounce 1.4s infinite ease-in-out;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.15);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}