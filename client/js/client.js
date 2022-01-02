let id;
let socketConnection;
let peerConnections = {};
let dataChannel;

function init() {

    // setting up socket connection
    socketConnection = new WebSocket('ws://' + 'hexagon-server-0110.herokuapp.com');
    socketConnection.onmessage = messageHandler;
    socketConnection.onopen = event => {
        sendMessage(id, 'server', 'JOIN', JSON.stringify({'id' : id}));
    }
}


function messageHandler(message) {
    let signal = JSON.parse(message.data);
    let peer = signal.from;
    let context = signal.context;
    let data = JSON.parse(signal.data);
    if (context != 'ICE' && context != 'SDP') {
        logClient(signal);
    }

    if (context == 'SDP') {
        // This is called after receiving an offer or answer from another peer
        
        peerConnections[peer].pc.setRemoteDescription(new RTCSessionDescription(data.SDP), () => {
            console.log('pc.remoteDescription.type', peerConnections[peer].pc.remoteDescription.type);
            // When receiving an offer lets answer it
            if (peerConnections[peer].pc.remoteDescription.type === 'offer') {
                console.log('Answering offer');
                peerConnections[peer].pc.createAnswer(localDescCreated, error => console.error(error));
            }

        }, error => console.error(error));
    } 
    
    else if (context == 'ICE') {
        // Add the new ICE candidate to our connections remote description
        console.log('Candidate');
        peerConnections[peer].pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }

    else if (context == 'PEER_LIST') {
        let peers = data.peer_list;
        for (let i = 0; i < peers.length; i++) {
            if(id != peers[i]){
                sendMessage(id, peers[i], 'CONNECT', JSON.stringify({'connection_type' : 'initial'}));
                logClient(`Connection request sent to: ${peers[i]}`);
            }
        }
    }
    else if (context == 'CONNECT') {
        logClient(`Connection request from: ${peer}`);

        setUpPeer(peer, true);
        // sending CONNECT_ACK response
        sendMessage(id, peer, 'CONNECT_ACK', '{}');
    }
    else if (context == 'CONNECT_ACK') {
        logClient(`Connection ACK from: ${peer}`);
        setUpPeer(peer);
    }
}

function sendMessage (from, to, context, data) {
    socketConnection.send(JSON.stringify({'from' : from, 'to' : to, 'context' : context, 'data' : data}));
}

function errorHandler(error) {
    logClient(error);
}

function logClient (msg) {
    console.log(msg);
    let dt = new Date().getTime();
    clientLogFileData.push({'timestamp' : dt, 'log' : msg});
}

async function setUpPeer(peer, initCall = false) {
    peerConnections[peer] = { 'id': peer, 'pc': new RTCPeerConnection() };
    peerConnections[peer].pc.onicecandidate = event => {
        if (event.candidate) {
            console.log('new candy');
            sendMessage(id, peer, 'ICE', { 'candidate': event.candidate });
        }
    };


    // peerConnections[peer].pc.ontrack = event => gotRemoteStream(event, peer);
    peerConnections[peer].pc.oniceconnectionstatechange = event => {
        if (peerConnections[peer].pc.iceConnectionState === "failed" ||
        peerConnections[peer].pc.iceConnectionState === "disconnected" ||
        peerConnections[peer].pc.iceConnectionState === "closed") {} else if (peerConnections[peer].pc.iceConnectionState === "connected") {}
    };
    
    if (initCall) {
        // If user is offerer let them create a negotiation offer and set up the data channel
        console.log('Establishing Call');
        peerConnections[peer].pc.onnegotiationneeded = () => {
            peerConnections[peer].pc.createOffer(desc => localDescCreated(desc, peer), error => console.error(error));
        }
        dataChannel = peerConnections[peer].pc.createDataChannel('hexagon-' + id + '-' + peer);
        setupDataChannel();
    } else {
        // If user is not the offerer let wait for a data channel
        console.log('Waiting for Call');
        peerConnections[peer].pc.ondatachannel = event => {
            console.log('DataChannel set up');
            dataChannel = event.channel;
            setupDataChannel();
        }
    }
}

async function setupDataChannel() {
    checkDataChannelState();
    dataChannel.onopen = checkDataChannelState;
    dataChannel.onclose = checkDataChannelState;
    dataChannel.onmessage = async(event) => {
        let jsonmsg = await decrypt(shared, event.data);
        console.log(jsonmsg);
        // insertMessageToDOM(jsonmsg, false);
    }

}

function checkDataChannelState() {
    console.log('WebRTC channel state is:', dataChannel.readyState);
    if (dataChannel.readyState === 'open') {
        p2p_flag = true;
    } else if (dataChannel.readyState === 'closed') {
        p2p_flag = false;
        dataChannel.close();
        dataChannel = null;
        setUpPeer(false);
    }
}
  
function localDescCreated(desc, peer) {
    peerConnections[peer].pc.setLocalDescription(
        desc,
        () => sendMessage(id, peer, 'SDP', { 'SDP': peerConnections[peer].pc.localDescription }),
        error => console.error(error)
    );
}

init();