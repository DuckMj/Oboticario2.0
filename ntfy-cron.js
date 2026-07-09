import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

// Insere aqui o teu objeto firebaseConfig exatamente como usas no teu admin.html
const firebaseConfig = {
    apiKey: "AIzaSyCi03g667vB1uOT1zsuDc1AkiyQ1b8o0GQ",
    authDomain: "oboticario-e8369.firebaseapp.com",
    projectId: "oboticario-e8369",
    storageBucket: "oboticario-e8369.firebasestorage.app",
    messagingSenderId: "1049718432679",
    appId: "1:1049718432679:web:94a2a574729fddd4750c82"
};

// Inicialização do Firebase utilizando ESM
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Parser de data idêntico ao do teu Front-end (DD/MM/YYYY)
function parseDataBr(dataStr) {
    if (!dataStr) return new Date(0);
    const partes = dataStr.split('/');
    if (partes.length !== 3) return new Date(0);
    return new Date(partes[2], partes[1] - 1, partes[0]);
}

function formatMoney(valor) {
    return Number(valor).toFixed(2).replace('.', ',');
}

async function processarVencimentos() {
    const limiteDiasAviso = 3; // Margem de antecedência para os alertas
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Array para armazenar as notificações individuais antes do disparo
    let filaNotificacoes = [];

    try {
        console.log("A iniciar ligação ao Firestore...");
        const [vendasSnap, faturasSnap] = await Promise.all([
            getDocs(collection(db, "vendas")),
            getDocs(collection(db, "faturas_boticario"))
        ]);

        // 1. Processamento das Faturas (O Boticário)
        faturasSnap.forEach(docSnap => {
            const f = docSnap.data();
            if (f.parcelas) {
                f.parcelas.forEach(p => {
                    if (p.status !== 'pago') {
                        const fData = parseDataBr(p.vencimento);
                        const diffDias = Math.round((fData - hoje) / 86400000);

                        if (diffDias <= limiteDiasAviso) {
                            let statusText = diffDias < 0 ? `🔴 Vencido há ${Math.abs(diffDias)} dias` : (diffDias === 0 ? `🟡 Vence HOJE` : `🟢 Vence em ${diffDias} dias`);
                            
                            filaNotificacoes.push({
                                title: "Fatura O Boticario",
                                body: `🏢 **ALERTA DE FATURA**\n\nID: #${docSnap.id}\nParcela: ${p.numero}x\nValor: R$ ${formatMoney(p.valor)}\n\nCronograma: ${statusText}`,
                                tags: "building,moneybag"
                            });
                        }
                    }
                });
            }
        });

        // 2. Processamento das Vendas (Clientes)
        vendasSnap.forEach(docSnap => {
            const v = docSnap.data();
            if (v.parcelas) {
                v.parcelas.forEach(p => {
                    if (p.status === 'pendente') {
                        const vData = parseDataBr(p.vencimento);
                        const diffDias = Math.round((vData - hoje) / 86400000);

                        if (diffDias <= limiteDiasAviso) {
                            let statusText = diffDias < 0 ? `🔴 Vencido há ${Math.abs(diffDias)} dias` : (diffDias === 0 ? `🟡 Vence HOJE` : `🟢 Vence em ${diffDias} dias`);
                            
                            filaNotificacoes.push({
                                title: "Cobranca de Cliente",
                                body: `🛍️ **COBRANÇA PENDENTE**\n\nCliente: ${v.nome_cliente.toUpperCase()}\nValor: R$ ${formatMoney(p.valor)}\nVencimento: ${p.vencimento}\n\nCronograma: ${statusText}`,
                                tags: "shopping_bags,money_with_wings"
                            });
                        }
                    }
                });
            }
        });

        // Se não houver alertas, encerra sem chamadas HTTP
        if (filaNotificacoes.length === 0) {
            console.log("Nenhum vencimento detetado para os próximos dias.");
            process.exit(0);
        }

        console.log(`Total de alertas gerados: ${filaNotificacoes.length}. Iniciando disparos sequenciais...`);

        // 3. Envio Individualizado (Loop síncrono com await para isolar as notificações)
        for (const notificacao of filaNotificacoes) {
            await fetch('https://ntfy.sh/bto_cob_matheus', {
                method: 'POST',
                body: notificacao.body.trim(),
                headers: {
                    'Title': notificacao.title, // String limpa sem emojis (evita erro ByteString)
                    'Tags': notificacao.tags,
                    'Markdown': 'yes'
                }
            });
            
            // Pequena pausa técnica de 300ms entre as requisições para evitar gargalo e garantir a ordem de entrega
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log("Todas as notificações individuais foram enviadas com sucesso.");
        process.exit(0);

    } catch (error) {
        console.error("Erro crítico durante a execução do Cron Job:", error);
        process.exit(1);
    }
}

processarVencimentos();
