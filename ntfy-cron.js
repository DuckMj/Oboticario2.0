const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

// Insere aqui o teu objeto firebaseConfig exatamente como usas no teu admin.html
const firebaseConfig = {
    apiKey: "AIzaSyCi03g667vB1uOT1zsuDc1AkiyQ1b8o0GQ",
    authDomain: "oboticario-e8369.firebaseapp.com",
    projectId: "oboticario-e8369",
    storageBucket: "oboticario-e8369.firebasestorage.app",
    messagingSenderId: "1049718432679",
    appId: "1:1049718432679:web:94a2a574729fddd4750c82"
};

// Inicialização do Firebase em ambiente Node.js
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

    let alertasClientes = [];
    let alertasFaturas = [];

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
                            alertasFaturas.push(`- Fatura #${docSnap.id} (${p.numero}x): R$ ${formatMoney(p.valor)} (${statusText})`);
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
                            alertasClientes.push(`- ${v.nome_cliente.toUpperCase()}: R$ ${formatMoney(p.valor)} (${statusText})`);
                        }
                    }
                });
            }
        });

        // Se não existirem registos críticos, finaliza a execução sem gastar dados do Ntfy
        if (alertasClientes.length === 0 && alertasFaturas.length === 0) {
            console.log("Nenhum vencimento detetado para os próximos dias.");
            process.exit(0);
        }

        // 3. Estruturação da Mensagem Markdown
        let msgNtfy = '';
        if (alertasFaturas.length > 0) {
            msgNtfy += `🏢 **FATURAS OBOTICÁRIO**\n${alertasFaturas.join('\n')}\n\n`;
        }
        if (alertasClientes.length > 0) {
            msgNtfy += `🛍️ **COBRANÇAS CLIENTES**\n${alertasClientes.join('\n')}`;
        }

        // 4. Envio do POST assíncrono para o Ntfy
        console.log("A enviar notificação para o Ntfy...");
        await fetch('https://ntfy.sh/bto_cob_matheus', {
            method: 'POST',
            body: msgNtfy.trim(),
            headers: {
                'Title': '⚠️ Relatório Diário de Vencimentos',
                'Tags': 'rotating_light,moneybag',
                'Markdown': 'yes'
            }
        });

        console.log("Execução concluída com sucesso.");
        process.exit(0);

    } catch (error) {
        console.error("Erro crítico durante a execução do Cron Job:", error);
        process.exit(1);
    }
}

processarVencimentos();