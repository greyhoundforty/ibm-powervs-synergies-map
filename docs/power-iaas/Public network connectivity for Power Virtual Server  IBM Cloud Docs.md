Source: [Public network connectivity for Power Virtual Server](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup)



IBM Power Virtual Server in

___

In some Power Virtual Server data centers, internet access is provided through alternative networking configurations because you cannot directly attach public subnets to the logical partition (LPAR) or virtual server instance (VSI) in these data centers. In these cases, you can use the virtual private cloud (VPC) infrastructure components and a transit gateway connection to provide both outbound and inbound network connectivity. A transit gateway connects VPCs and Power Virtual Server workspaces.

## Configuring the public network for a Power Virtual Server instance

Complete the following steps to configure public network access for your LPAR or VSI:

1.  Log in to the [IBM Cloud catalog (opens in a new tab)](https://cloud.ibm.com/catalog) with your IBM credentials.
    
2.  In the search box, type **Power Virtual Server** and click the **Power Virtual Server** tile.
    
3.  In the navigation panel, click **Workspaces**. The Workspaces page with a list of existing workspaces is displayed.
    
4.  Click your workspace in the list to open the "Virtual server instances" page.
    
5.  Create a VSI. For instructions, see [Configuring a Power Virtual Server instance](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-creating-power-virtual-server#configuring-instance).
    
6.  Configure the outbound networking for the VSI. For instructions, see [Outbound network overview](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#outbound-overview).
    
7.  Configure the inbound networking for the VSI. For instructions, see [Inbound network overview](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#inbound-overview). You can configure inbound networking only after you configure outbound networking.
    

Note: You must select the same region and zone as your VSI for all the configurations.

## Outbound network overview

Power Virtual Server instances can access the internet through outbound network connections. The following architecture describes this setup:

1.  Connect the Power Virtual Server workspace to a transit gateway. The transit gateway provides the connection between the Power Virtual Server instance and the VPC infrastructure.
2.  Connect the transit gateway to a VPC that contains a network load balancer (NLB) that is configured in routing mode.
3.  Route internet traffic from Power Virtual Server instances through a VPC subnet to the internet by using the NLB as a routing gateway. The VPC security groups that are associated with the NLB filter the traffic between the Power Virtual Server instance and the internet.
4.  Attach the VPC subnet to a public gateway that provides the actual internet connectivity.

The following diagram illustrates the outbound network architecture to show how traffic flows from Power Virtual Server instances through the transit gateway, VPC, and NLB to reach the internet.

![Outbound network architecture diagram](https://cloud.ibm.com/docs/api/docs-content/v4/content/d8be74103bf42298e4f99e5154d00e9419e068e7/power-iaas/images/outbound-network-access-architecture.svg "Outbound network architecture")

Figure 1. Outbound network architecture

When an LPAR or VSI in a Power Virtual Server workspace sends traffic to the internet, it sends the data packets to the default gateway. The default gateway routes the traffic through the transit gateway to the VPC. The VPC routing table directs traffic to the NLB, which forwards the traffic through the public gateway to the internet. The return traffic follows the same path back to the Power Virtual Server instance.

### Considerations for outbound connectivity

Planning the outbound connectivity for your Power Virtual Server instance includes the following considerations:

-   A workspace with no external connections restricts LPAR and VSI communication to resources within the same Power Virtual Server workspace only.
-   A workspace that is connected to a transit gateway links to a VPC with internet access and enables outbound connectivity for the workspace resources.
-   Your Power Virtual Server instances use the network connectivity defined in the workspace configuration. As a result, you need not configure network access for individual LPARs or VSIs.

## Configuring outbound network access for Power Virtual Server

Complete the following steps to configure outbound network access for Power Virtual Server:

Note: Ensure that a VSI is created before you configure outbound network access. For more information, see [Configuring public network for Power Virtual Server instance](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#setup-public-networking).

### Step 1: Create the VPC infrastructure.

1.  Create a VPC and subnet. For instructions, see [Creating a VPC and subnet (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-creating-a-vpc-using-the-ibm-cloud-console&q=Create+VPC+Infrastructure&tags=vpc#creating-a-vpc-and-subnet).
    
    When you create a VPC, set the following values:
    
    -   Select the same region as your Power Virtual Server workspace.
    -   Ensure that you select the **Create a default prefix for each zone** checkbox.
    
    If the **Create a default prefix for each zone** checkbox is selected, IBM Cloud automatically creates default subnets in each available zone. You can use these default subnets for the NLB or create a custom subnet.
    
2.  Record the subnet ID and Classless Inter-Domain Routing (CIDR) range of the subnet. Use the subnet ID and CIDR range when you create an NLB. For more information, see [Create a private NLB in routing mode](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-nlb).
    
3.  Create a public gateway and attach the public gateway to the VPC subnet. For instructions, see [Creating public gateways (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-public-gateways&interface=ui).
    

### Step 2: Create a private NLB in routing mode.

1.  Create a private NLB in routing mode. For instructions, see [Creating a network load balancer with routing mode by using the UI (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-nlb-vnf&interface=ui#nlb-vnf-ui).
    
    When you create the NLB, set the following values:
    
    -   Select the same VPC and VPC subnet that you created in [Step 1: Create the VPC infrastructure](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-vpc).
    -   In the details section, select the type as **Private**.
    -   Set **Routing mode for VNFs** to **Enabled** to enable the routing mode for virtual network functions (VNFs).
    -   Leave the **Back-end pools** and **Front-end listeners** sections empty.
    -   In the **Security groups** section, select the VPC default security group.
2.  Create a back-end pool for your NLB. For instructions, see [Working with network load balancer pools (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-nlb-pools).
    
    When you create the back-end pool for your NLB, set the following values:
    
    -   Leave the **Instance group** field empty.
    -   Select **Bypass** as the failsafe policy.
3.  Configure a listener for your NLB. For instructions, see [Working with listeners (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-nlb-listeners&q=create+a+listener&tags=vpc&offset=10).
    
    When you create the listener for your NLB, select the back-end pool for your NLB as the default back-end pool.
    

### Step 3: Create a transit gateway and connect to Power Virtual Server.

1.  Create a transit gateway. For instructions, see [Creating a transit gateway (opens in a new tab)](https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-ordering-transit-gateway&interface=ui).
    
    When you create the transit gateway, set the following values:
    
    -   Select the default resource group.
    -   Ensure that **GRE enhanced route propagation** is set to **Disabled**. For more information, see [Generic Routing Encapsulation (GRE) connection considerations (opens in a new tab)](https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-helpful-tips&interface=ui#gre-considerations).
    -   Select **Local routing** for a single region.
    -   Choose a location that matches your Power Virtual Server workspace location.
    -   Create the transit gateway without adding network connections.
2.  Connect the VPC to the transit gateway. For instructions, see [Adding a connection (opens in a new tab)](https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-adding-connections&interface=ui).
    
    When you connect the VPC to the transit gateway, set the following values:
    
    -   Select **VPC** as the network connection.
    -   In the **Connection reach** area, click **Add new connection in this account**.
    -   Use the same region, which is the region of the transit gateway.
    -   Select your VPC in the **Available connection** section.
3.  Connect the Power Virtual Server workspace to the transit gateway. For instructions, see [Adding a connection (opens in a new tab)](https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-adding-connections&interface=ui).
    
    When you connect the Power Virtual Server workspace to the transit gateway, set the following values:
    
    -   Select **Power Systems Virtual Server** as the network connection.
    -   Select **Add new connection in this account** as the connection reach.
    -   Use the same region, which is the region of the transit gateway.
    -   Select your Power Virtual Server workspace in the **Available connection** section.

### Step 4: Configure VPC routing.

1.  Create a custom routing table. For instructions, see [Creating a routing table (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-vpc-routing-table&interface=ui).
    
    When you create the routing table, set the following values:
    
    -   Select your VPC.
    -   In the **Traffic** section, set the **Transit gateway** to on.
    -   Set **Advertise to** to **On**.
2.  Create a route. For instructions, see [Creating a route (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-vpc-route&interface=ui).
    
    When you create the route, set the following values:
    
    -   Select the same zone as your NLB.
        
    -   Set **Destination CIDR** to the following value:
        
        `0.0.0.0/0`
        
    -   Set **Priority** to **2**, **Action** to **Deliver**, and **Next hop (IP address)** to the IP address of your NLB.
        
    -   Set **Advertise** to **On**.
        

### Step 5: Test outbound connectivity.

From the Power Virtual Server VSI console, run the following command to test the outbound connectivity:

For example:

Note: If your outbound connectivity is not working, check whether your VPC security group is configured correctly. You must review the rules that allow only the required TCP protocols. For more information about security groups, see [About security groups (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-using-security-groups).

## Inbound network overview

You can enable inbound network connectivity to allow external clients on the internet to initiate connections to your Power Virtual Server instances. This inbound network connectivity requires the [outbound network configuration](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#outbound-network). The following architecture describes this setup:

1.  Allocate and bind a public IP address range to your VPC in the same zone as your NLB.
2.  Configure a secondary network interface within the guest operating system on your Power Virtual Server instance by using the public IP address.
3.  Configure VPC route tables to direct incoming internet traffic for the public IP address to the NLB.
4.  Forward internet traffic from the NLB through the transit gateway to your Power Virtual Server workspace.
5.  Create a custom route in your Power Virtual Server workspace to send internet traffic for the public IP address directly to the private IP address of your Power Virtual Server instance.

The following diagram illustrates the inbound network architecture to show how internet traffic is routed through the VPC infrastructure to reach your Power Virtual Server instances.

![Inbound network architecture diagram](https://cloud.ibm.com/docs/api/docs-content/v4/content/d8be74103bf42298e4f99e5154d00e9419e068e7/power-iaas/images/inbound-network-access-architecture.svg "Inbound network architecture")

Figure 2. Inbound network architecture

When a client on the internet sends traffic to your public IP address, the VPC subnet routing table delegates the traffic to the VPC routing table. The VPC routing table forwards the traffic to the private IP address of the NLB. The NLB forwards the traffic through the transit gateway to Power Virtual Server. The workspace routes the traffic directly to your Power Virtual Server instance by using its private IP address. The Power Virtual Server instance receives the traffic on the secondary interface that is configured with the public IP address.

The Power Virtual Server instance sends the response from the public IP address on the secondary interface. Power Virtual Server routes the response through the transit gateway to the VPC, which routes the response to the NLB. The NLB then forwards the response to the internet.

## Configuring inbound network access for Power Virtual Server

Configure the inbound network by using the same VPC and subnet that you created in [Step 1: Create VPC infrastructure](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-vpc).

Note: Ensure that a VSI is created and the outbound network access is configured before you configure the inbound network access. For more information, see [Configuring public network for Power Virtual Server instance](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#setup-public-networking).

### Step 1: Attach a public IP address range to the VPC.

Note: If you have a public IP address that is attached to your VPC, do not perform this step and go to [Step 2: Locate the NLB IP address](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#find-nlb).

1.  Reserve a public address range and attach it to the VPC. For instructions, see [Creating public address ranges (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-par-creating&interface=ui).
    
    When you create the public address range, set the following values:
    
    -   Set the **Size** to the following value:
        
        `/32 (1 address)`
        
    -   Retain the default value for **Geography**, **Region**, and **Resource group**.
        
    -   Set **Bind** to on. Select your VPC to attach the public address range.
        
    -   Set **Zone** to the same zone as the NLB that you created in [Step 2: Create a private NLB in the route mode](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-nlb).
        
2.  Record the allocated public IP address. Use this IP address to access your Power Virtual Server VSI from the internet.
    

### Step 2: Locate the NLB IP address.

Complete the following steps to locate the private IP address of the NLB that you created in [Step 2: Create a private NLB in the route mode](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-nlb).

Note: If you have not created an NLB, create an NLB in routing mode. For instructions, see [Step 2: Create a private NLB in the route mode](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-nlb).

1.  Log in to the [IBM Cloud catalog (opens in a new tab)](https://cloud.ibm.com/catalog) with your IBM credentials.
    
2.  From the **Navigation** menu, click **Infrastructure** > **Network** > **Load balancers**.
    
3.  Select your NLB and record the private IP address.
    

### Step 3: Configure a VPC routing table for the internet traffic.

1.  Create a routing table to direct incoming internet traffic for the public IP address to the NLB. For instructions, see [Creating a routing table (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-vpc-routing-table&interface=ui).
    
    When you create the routing table, set the following values:
    
    -   Select your VPC.
    -   Set **Traffic source** to **Internet**.
    -   Set **Advertise to** to **Off**.
2.  Create a route. For instructions, see [Creating a route (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-vpc-route&interface=ui).
    
    When you create the route, set the following values:
    
    -   Set the **Zone** to the same zone as your NLB.
        
    -   Set **Destination CIDR** to the following value:
        
        `1.2.3.4/32`
        
    -   Set **Priority** to **2**, **Action** to **Deliver**, and **Next hop (IP address)** to the IP address of your NLB.
        
    -   Set **Advertise** to **Off**.
        

### Step 4: Create the transit gateway.

The transit gateway that you created for outbound connectivity already connects the VPC and Power Virtual Server. For more information, see [Step 3: Create transit gateway and connect to Power Virtual Server](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#create-transit-gateway).

### Step 5: Configure VPC routing for the transit gateway.

The transit gateway is already configured for outbound connectivity. For more information, see [Step 4: Configure VPC routing](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#vpc-routing).

### Step 6: Configure the VPC routing table that is associated with the NLB subnet.

Route the incoming traffic for the public IP address to the VPC subnet. Configure the default routing table and create a route for your VPC. For instructions, see [Creating a route (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-create-vpc-route&interface=ui).

When you create a route in the default routing table of your VPC, set the following values:

-   Set the **Zone** to the same zone as your NLB.
    
-   Set **Destination CIDR** to the following value:
    
    `1.2.3.4/32`
    
-   Set **Action** to **Delegate-VPC** and **Next hop (IP address)** to the IP address of your NLB.
    
-   Set **Advertise** to **Off**.
    

Important: Do not modify the routing table that you created in [Step 4: Configure VPC routing](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-powervs-public-network-setup#vpc-routing).

### Step 7: Configure a Power Virtual Server route.

Add a static route to your Power Virtual Server workspace that points to your VSI. For instructions, see [Creating and managing network routes in IBM Power Virtual Server workspaces](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-routes).

When you create the static route, set the following values:

-   Set **Destination** to the following value:
    
    `1.2.3.4/32`
    
-   Set **Next hop** to your VSI IP address.
    
-   Set **Advertise** and **State** to **Enabled**.
    

This static route configuration routes traffic for the public IP address directly to the VSI.

### Step 8: Configure the VSI network.

Because Power Virtual Server does not support network address translation (NAT), you must configure the public IP address as a secondary interface in the guest operating system of your VSI. Retain the existing private interface for normal Power Virtual Server subnet connectivity and add the public IP address to a secondary interface.

Configure the secondary interface in the guest operating system on your VSI, and not in the Power Virtual Server console. Complete this task in the operating system of your VSI that receives the routed internet traffic.

### Step 9: Configure the security groups for the NLB to permit inbound internet traffic.

If the outbound connectivity is configured, the required security groups are already mapped to your NLB. Verify that the security groups allow the required inbound ports for your public IP address.

If the security groups that are mapped to your NLB do not permit the inbound internet traffic, configure the security groups to add the rules for inbound internet traffic. For instructions, see [Defining security group rules (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-using-security-groups#defining-security-group-rules).

For new outbound or inbound connections, map the required security groups to the NLB. You can also adjust the rules to match your security requirements. For more information about security groups, see [About security groups (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-using-security-groups).

### Step 10: Test the public IP address

Test the public IP address from an external network by using a protocol that is allowed by your network security group.

For example:

or

With outbound and inbound network connectivity configured, your Power Virtual Server instance can communicate with external networks by using the VPC infrastructure and a transit gateway.