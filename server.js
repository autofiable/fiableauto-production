// ===== server.js - FiableAuto Backend Production Enhanced =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://fiableauto-frontend.vercel.app');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

console.log('🚗 Démarrage FiableAuto Backend Enhanced...');

// Configuration PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { 
        rejectUnauthorized: false 
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connexion et initialisation
async function initializeApp() {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL connecté');
        client.release();
        await initDatabase();
    } catch (err) {
        console.error('❌ Erreur connexion PostgreSQL:', err);
        // En mode développement, continuer sans DB
        if (process.env.NODE_ENV !== 'production') {
            console.log('⚠️ Fonctionnement en mode développement sans DB');
        }
    }
}

// Initialisation des tables Enhanced
async function initDatabase() {
    try {
        // Table missions Enhanced
        await pool.query(`
            CREATE TABLE IF NOT EXISTS missions (
                id SERIAL PRIMARY KEY,
                mission_code VARCHAR(20) UNIQUE NOT NULL,
                vehicle_brand VARCHAR(100) NOT NULL,
                vehicle_model VARCHAR(100) NOT NULL,
                vehicle_year INTEGER,
                license_plate VARCHAR(20),
                vin VARCHAR(50),
                mileage INTEGER,
                fuel_level VARCHAR(20),
                interior_condition VARCHAR(20),
                exterior_condition VARCHAR(20),
                mission_type VARCHAR(20) DEFAULT 'inspection',
                pickup_location TEXT NOT NULL,
                delivery_location TEXT NOT NULL,
                pickup_date TIMESTAMP,
                delivery_date TIMESTAMP,
                urgency VARCHAR(20) DEFAULT 'normal',
                client_name VARCHAR(255) NOT NULL,
                client_email VARCHAR(255) NOT NULL,
                client_phone VARCHAR(20),
                client_company VARCHAR(255),
                provider_name VARCHAR(255),
                provider_email VARCHAR(255),
                provider_phone VARCHAR(20),
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                observations TEXT,
                internal_notes TEXT,
                client_signature TEXT,
                signature_timestamp TIMESTAMP,
                created_by INTEGER,
                assigned_to INTEGER
            )
        `);

        // Table photos Enhanced
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mission_photos (
                id SERIAL PRIMARY KEY,
                mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
                photo_type VARCHAR(50) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                original_name VARCHAR(255),
                file_size INTEGER,
                mime_type VARCHAR(100),
                storage_url TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                gps_latitude DECIMAL(10, 8),
                gps_longitude DECIMAL(11, 8),
                device_info TEXT,
                UNIQUE(mission_id, photo_type)
            )
        `);

        // Table inspections Enhanced (NOUVELLE)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inspections (
                id SERIAL PRIMARY KEY,
                mission_id INTEGER UNIQUE REFERENCES missions(id) ON DELETE CASCADE,
                observations TEXT,
                signature TEXT,
                checklist JSONB,
                key_count INTEGER DEFAULT 0,
                optional_photos_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Table notifications
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                recipient VARCHAR(255) NOT NULL,
                subject VARCHAR(255),
                content TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                sent_at TIMESTAMP,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Tables créées/vérifiées (Enhanced)');
    } catch (error) {
        console.error('❌ Erreur initialisation DB:', error);
    }
}

// Middleware de sécurité
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:"],
        },
    },
}));

// CORS Enhanced
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://fiableauto.fr', 'https://www.fiableauto.fr', 'https://fiableauto-frontend.vercel.app']
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
    message: {
        success: false,
        message: 'Trop de requêtes, veuillez réessayer plus tard.'
    }
});
app.use('/api/', limiter);

// Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Upload
app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: { success: false, message: 'Fichier trop volumineux (max 10MB)' },
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ===== ROUTES API ENHANCED =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'FiableAuto API Enhanced is running',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        features: ['archivage', 'checklist', 'dark-mode', 'geolocation', 'pwa-ready']
    });
});

// Générer code mission
async function generateMissionCode() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    
    try {
        const result = await pool.query(
            'SELECT mission_code FROM missions WHERE mission_code LIKE $1 ORDER BY mission_code DESC LIMIT 1',
            [`FA-${date}-%`]
        );
        
        let sequence = 1;
        if (result.rows.length > 0) {
            const lastCode = result.rows[0].mission_code;
            const lastSequence = parseInt(lastCode.split('-')[2]);
            sequence = lastSequence + 1;
        }
        
        return `FA-${date}-${sequence.toString().padStart(3, '0')}`;
    } catch (error) {
        // Fallback si DB non disponible
        return `FA-${date}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    }
}

// GET /api/stats Enhanced
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
            FROM missions
        `);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erreur stats:', error);
        // Retourner des stats par défaut
        res.json({
            success: true,
            data: { total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 }
        });
    }
});

// GET /api/missions - NOUVEAU : Lister toutes les missions (ARCHIVAGE)
app.get('/api/missions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM missions 
            ORDER BY created_at DESC
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erreur récupération missions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des missions'
        });
    }
});

// POST /api/missions Enhanced
app.post('/api/missions', async (req, res) => {
    try {
        const {
            vehicleBrand, vehicleModel, vehicleYear, licensePlate, vin, mileage,
            fuelLevel, interiorCondition, exteriorCondition, missionType,
            pickupLocation, deliveryLocation, pickupDate, deliveryDate, urgency,
            clientName, clientEmail, clientPhone, clientCompany,
            providerName, providerEmail, providerPhone,
            observations, internalNotes
        } = req.body;

        // Validation Enhanced
        if (!vehicleBrand || !vehicleModel || !pickupLocation || !deliveryLocation || !clientName || !clientEmail) {
            return res.status(400).json({
                success: false,
                message: 'Champs requis manquants'
            });
        }

        const missionCode = await generateMissionCode();
        
        const query = `
            INSERT INTO missions (
                mission_code, vehicle_brand, vehicle_model, vehicle_year,
                license_plate, vin, mileage, fuel_level, interior_condition, exterior_condition,
                mission_type, pickup_location, delivery_location,
                pickup_date, delivery_date, urgency, client_name, client_email,
                client_phone, client_company, provider_name, provider_email,
                provider_phone, observations, internal_notes, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
            RETURNING *
        `;
        
        const values = [
            missionCode, vehicleBrand, vehicleModel, vehicleYear,
            licensePlate, vin, mileage, fuelLevel, interiorCondition, exteriorCondition,
            missionType || 'inspection', pickupLocation, deliveryLocation,
            pickupDate, deliveryDate, urgency || 'normal', clientName, clientEmail,
            clientPhone, clientCompany, providerName, providerEmail,
            providerPhone, observations, internalNotes, 'pending'
        ];
        
        const result = await pool.query(query, values);
        
        res.status(201).json({
            success: true,
            data: result.rows[0],
            message: 'Mission créée avec succès'
        });
        
    } catch (error) {
        console.error('Erreur création mission:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la mission'
        });
    }
});

// POST /api/missions/:id/inspection - NOUVEAU : Sauvegarder inspection complète
app.post('/api/missions/:id/inspection', async (req, res) => {
    try {
        const { id } = req.params;
        const { observations, signature, checklist, keyCount, optionalPhotos } = req.body;
        
        // Insérer/Mettre à jour inspection
        const result = await pool.query(`
            INSERT INTO inspections (mission_id, observations, signature, checklist, key_count, optional_photos_count)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (mission_id) DO UPDATE SET
                observations = EXCLUDED.observations,
                signature = EXCLUDED.signature,
                checklist = EXCLUDED.checklist,
                key_count = EXCLUDED.key_count,
                optional_photos_count = EXCLUDED.optional_photos_count,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [id, observations, signature, JSON.stringify(checklist), keyCount, optionalPhotos]);
        
        // Mettre à jour aussi la table missions
        await pool.query(
            'UPDATE missions SET observations = $2, client_signature = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id, observations, signature]
        );
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Inspection sauvegardée avec succès'
        });
        
    } catch (error) {
        console.error('Erreur sauvegarde inspection:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la sauvegarde de l\'inspection'
        });
    }
});

// GET /api/missions/:code Enhanced
app.get('/api/missions/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const query = `
            SELECT m.*, 
                   i.checklist,
                   i.key_count,
                   i.optional_photos_count,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'id', mp.id,
                               'type', mp.photo_type,
                               'url', mp.storage_url,
                               'filename', mp.filename,
                               'uploaded_at', mp.uploaded_at
                           ) ORDER BY mp.uploaded_at
                       ) FILTER (WHERE mp.id IS NOT NULL), 
                       '[]'::json
                   ) as photos
            FROM missions m
            LEFT JOIN inspections i ON m.id = i.mission_id
            LEFT JOIN mission_photos mp ON m.id = mp.mission_id
            WHERE m.mission_code = $1 OR m.id::text = $1
            GROUP BY m.id, i.checklist, i.key_count, i.optional_photos_count
        `;
        
        const result = await pool.query(query, [code]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erreur récupération mission:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération de la mission'
        });
    }
});

// PUT /api/missions/:id/status Enhanced
app.put('/api/missions/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'assigned', 'in_progress', 'photos_taken', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Statut invalide'
            });
        }
        
        let updateQuery = 'UPDATE missions SET status = $2, updated_at = CURRENT_TIMESTAMP';
        const values = [id, status];
        
        if (status === 'in_progress') {
            updateQuery += ', started_at = CURRENT_TIMESTAMP';
        } else if (status === 'completed') {
            updateQuery += ', completed_at = CURRENT_TIMESTAMP';
        }
        
        updateQuery += ' WHERE id = $1 RETURNING *';
        
        const result = await pool.query(updateQuery, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Statut mis à jour avec succès'
        });
        
    } catch (error) {
        console.error('Erreur mise à jour statut:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du statut'
        });
    }
});

// POST /api/uploads/photos/:missionId Enhanced
app.post('/api/uploads/photos/:missionId', async (req, res) => {
    try {
        const { missionId } = req.params;
        const { photoType } = req.body;
        
        if (!req.files || !req.files.photo) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier téléchargé'
            });
        }
        
        const photo = req.files.photo;
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        
        if (!allowedTypes.includes(photo.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'Type de fichier non autorisé'
            });
        }
        
        // Vérifier mission
        const missionCheck = await pool.query('SELECT id FROM missions WHERE id = $1', [missionId]);
        if (missionCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        // Simuler stockage (en attendant Cloudflare R2)
        const filename = `${Date.now()}_${photo.name}`;
        const mockUrl = `https://via.placeholder.com/400x300/007bff/ffffff?text=${encodeURIComponent(photoType)}`;
        
        const query = `
            INSERT INTO mission_photos (
                mission_id, photo_type, filename, original_name, 
                file_size, mime_type, storage_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (mission_id, photo_type) 
            DO UPDATE SET 
                filename = EXCLUDED.filename,
                original_name = EXCLUDED.original_name,
                file_size = EXCLUDED.file_size,
                mime_type = EXCLUDED.mime_type,
                storage_url = EXCLUDED.storage_url,
                uploaded_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const values = [missionId, photoType, filename, photo.name, photo.size, photo.mimetype, mockUrl];
        const result = await pool.query(query, values);
        
        res.json({
            success: true,
            data: {
                photo: result.rows[0],
                url: mockUrl
            },
            message: 'Photo téléchargée avec succès'
        });
        
    } catch (error) {
        console.error('Erreur upload photo:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du téléchargement de la photo'
        });
    }
});

// PUT /api/missions/:id/observations Enhanced (auto-save)
app.put('/api/missions/:id/observations', async (req, res) => {
    try {
        const { id } = req.params;
        const { observations } = req.body;
        
        const result = await pool.query(
            'UPDATE missions SET observations = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id, observations]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Observations mises à jour avec succès'
        });
        
    } catch (error) {
        console.error('Erreur observations:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour des observations'
        });
    }
});

// POST /api/missions/:id/signature Enhanced
app.post('/api/missions/:id/signature', async (req, res) => {
    try {
        const { id } = req.params;
        const { signature } = req.body;
        
        if (!signature) {
            return res.status(400).json({
                success: false,
                message: 'Signature requise'
            });
        }
        
        const result = await pool.query(
            'UPDATE missions SET client_signature = $2, signature_timestamp = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id, signature]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Signature ajoutée avec succès'
        });
        
    } catch (error) {
        console.error('Erreur signature:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'ajout de la signature'
        });
    }
});

// GET /api/stats/advanced - NOUVEAU : Statistiques avancées
app.get('/api/stats/advanced', async (req, res) => {
    try {
        const results = await Promise.all([
            // Stats de base
            pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
                FROM missions
            `),
            
            // Stats par mois
            pool.query(`
                SELECT 
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as count
                FROM missions 
                WHERE created_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month
            `),
            
            // Top véhicules
            pool.query(`
                SELECT 
                    CONCAT(vehicle_brand, ' ', vehicle_model) as vehicle,
                    COUNT(*) as count
                FROM missions 
                GROUP BY vehicle_brand, vehicle_model
                ORDER BY count DESC
                LIMIT 10
            `),
            
            // Temps moyen de traitement
            pool.query(`
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_hours
                FROM missions 
                WHERE completed_at IS NOT NULL
            `)
        ]);
        
        res.json({
            success: true,
            data: {
                basic: results[0].rows[0],
                monthly: results[1].rows,
                topVehicles: results[2].rows,
                avgProcessingHours: results[3].rows[0]?.avg_hours || 0
            }
        });
        
    } catch (error) {
        console.error('Erreur stats avancées:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du calcul des statistiques'
        });
    }
});

// GET /api/missions/search - NOUVEAU : Recherche avancée
app.get('/api/missions/search', async (req, res) => {
    try {
        const { q, status, dateFrom, dateTo, vehicleBrand } = req.query;
        
        let query = 'SELECT * FROM missions WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (q) {
            query += ` AND (
                mission_code ILIKE $${paramIndex} OR 
                client_name ILIKE $${paramIndex} OR 
                vehicle_brand ILIKE $${paramIndex} OR 
                vehicle_model ILIKE $${paramIndex}
            )`;
            params.push(`%${q}%`);
            paramIndex++;
        }
        
        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (dateFrom) {
            query += ` AND created_at >= $${paramIndex}`;
            params.push(dateFrom);
            paramIndex++;
        }
        
        if (dateTo) {
            query += ` AND created_at <= $${paramIndex}`;
            params.push(dateTo);
            paramIndex++;
        }
        
        if (vehicleBrand) {
            query += ` AND vehicle_brand ILIKE $${paramIndex}`;
            params.push(`%${vehicleBrand}%`);
            paramIndex++;
        }
        
        query += ' ORDER BY created_at DESC LIMIT 100';
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erreur recherche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche'
        });
    }
});

// GET /api/reports/:missionId/pdf Enhanced
app.get('/api/reports/:missionId/pdf', async (req, res) => {
    try {
        const { missionId } = req.params;
        
        const mission = await pool.query('SELECT * FROM missions WHERE id = $1', [missionId]);
        
        if (mission.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mission introuvable'
            });
        }
        
        if (mission.rows[0].status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Le rapport n\'est disponible que pour les missions terminées'
            });
        }
        
        // Redirection vers PDF demo Enhanced
        res.redirect('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
        
    } catch (error) {
        console.error('Erreur PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération du rapport'
        });
    }
});

// Route de base Enhanced
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'FiableAuto API Server Enhanced',
        version: '2.0.0',
        features: ['archivage', 'checklist-complete', 'dark-mode', 'geolocation', 'pwa-ready'],
        endpoints: {
            health: '/api/health',
            stats: '/api/stats',
            'stats-advanced': '/api/stats/advanced',
            missions: '/api/missions',
            'mission-search': '/api/missions/search',
            uploads: '/api/uploads',
            reports: '/api/reports'
        }
    });
});

// Route catch-all Enhanced
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route introuvable',
        available_endpoints: [
            '/api/health', 
            '/api/stats', 
            '/api/missions', 
            '/api/missions/search',
            '/api/stats/advanced'
        ]
    });
});

// Gestionnaire d'erreurs Enhanced
app.use((err, req, res, next) => {
    console.error('Erreur serveur Enhanced:', err);
    res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown Enhanced
process.on('SIGTERM', () => {
    console.log('SIGTERM reçu, arrêt gracieux Enhanced...');
    server.close(() => {
        pool.end();
        process.exit(0);
    });
});

// Démarrage du serveur Enhanced
const server = app.listen(PORT, () => {
    console.log(`🚗 FiableAuto Backend Production Enhanced`);
    console.log(`🌍 Port: ${PORT}`);
    console.log(`🔥 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 API Health: /api/health`);
    console.log(`✨ Features: Archivage, Checklist, Dark Mode, PWA Ready`);
    console.log(`📊 New Endpoints: /api/missions, /api/missions/search, /api/stats/advanced`);
});

// Initialiser l'application Enhanced
initializeApp();

module.exports = app;
